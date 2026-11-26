import logging
import math
import re
import time
from collections import Counter
import numpy as np

logger = logging.getLogger(__name__)

GEMINI_BATCH_SIZE = 100
TRANSIENT_MARKERS = ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "high demand", "overloaded")

STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
    "is", "it", "of", "on", "or", "that", "the", "to", "with", "using", "across",
}


def tokenize_ngrams(text: str) -> list[str]:
    tokens = [t for t in re.findall(r"[a-z0-9+#.]+", text.lower()) if t not in STOP_WORDS and len(t) > 1]
    bigrams = [f"{tokens[i]} {tokens[i + 1]}" for i in range(len(tokens) - 1)]
    return tokens + bigrams


class PureNumpyTfidfSVD:
    """Dependency-free TF-IDF + Truncated SVD projector built purely on NumPy."""

    def __init__(self, max_features: int = 3000, n_components: int = 64):
        self.max_features = max_features
        self.n_components = n_components
        self.vocab: dict[str, int] = {}
        self.idf: np.ndarray = np.zeros(0, dtype=np.float32)
        self.projection: np.ndarray = np.zeros((0, 0), dtype=np.float32)

    def fit(self, texts: list[str]) -> "PureNumpyTfidfSVD":
        doc_freq: Counter[str] = Counter()
        tokenized_docs = [tokenize_ngrams(t) for t in texts]
        for toks in tokenized_docs:
            for term in set(toks):
                doc_freq[term] += 1

        top_terms = [term for term, _ in doc_freq.most_common(self.max_features)]
        self.vocab = {term: idx for idx, term in enumerate(top_terms)}
        n_docs = max(1, len(texts))
        self.idf = np.array(
            [math.log((1 + n_docs) / (1 + doc_freq[term])) + 1.0 for term in top_terms],
            dtype=np.float32,
        )

        tfidf = self._tfidf_matrix(tokenized_docs)
        if tfidf.shape[0] == 0 or tfidf.shape[1] == 0:
            self.projection = np.zeros((0, 1), dtype=np.float32)
            return self

        _, _, vt = np.linalg.svd(tfidf, full_matrices=False)
        k = min(self.n_components, vt.shape[0])
        self.projection = vt[:k].T.astype(np.float32)
        return self

    def _tfidf_matrix(self, tokenized_docs: list[list[str]]) -> np.ndarray:
        mat = np.zeros((len(tokenized_docs), len(self.vocab)), dtype=np.float32)
        for row_idx, toks in enumerate(tokenized_docs):
            counts = Counter(toks)
            for term, cnt in counts.items():
                col = self.vocab.get(term)
                if col is not None:
                    mat[row_idx, col] = (1.0 + math.log(cnt)) * self.idf[col]
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1.0, norms)
        return mat / norms

    def transform_tfidf(self, texts: list[str]) -> np.ndarray:
        return self._tfidf_matrix([tokenize_ngrams(t) for t in texts])

    def transform_dense(self, texts: list[str]) -> np.ndarray:
        tfidf = self.transform_tfidf(texts)
        dense = tfidf @ self.projection
        norms = np.linalg.norm(dense, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1.0, norms)
        return (dense / norms).astype(np.float32)


class EmbeddingService:
    """
    Produces L2-normalized dense embeddings for roles, skills, and user profiles.
    Supported backends:
    - "sentence_transformers": local all-MiniLM-L6-v2 (CPU PyTorch)
    - "gemini": Google Gemini Embedding API (low RAM, ideal for 512 MB tiers)
    - "tfidf_svd": deterministic pure-NumPy TF-IDF + SVD offline fallback
    """

    def __init__(
        self,
        backend: str = "sentence_transformers",
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        gemini_api_key: str = "",
        gemini_embedding_model: str = "gemini-embedding-001",
        gemini_embedding_dims: int = 768,
        retry_delay_seconds: float = 0.8,
    ):
        self.requested_backend = backend.lower().strip()
        self.model_name = model_name
        self.gemini_embedding_model = gemini_embedding_model
        self.gemini_embedding_dims = gemini_embedding_dims
        self.retry_delay_seconds = retry_delay_seconds

        self.active_backend = "tfidf_svd"
        self._st_model = None
        self._gemini_client = None
        self._gemini_ready_dim: int | None = None
        self._svd: PureNumpyTfidfSVD | None = None

        if self.requested_backend == "gemini":
            if gemini_api_key.strip():
                try:
                    from google import genai

                    self._gemini_client = genai.Client(api_key=gemini_api_key.strip())
                    self.active_backend = f"gemini:{gemini_embedding_model}"
                    logger.info(
                        "Initialized Gemini embedding client: %s (dims=%d)",
                        gemini_embedding_model,
                        gemini_embedding_dims,
                    )
                except Exception as exc:
                    logger.warning(
                        "Falling back to TF-IDF+SVD embeddings because Gemini client failed to initialize: %s",
                        exc,
                    )
            else:
                logger.warning(
                    "EMBEDDING_BACKEND=gemini requested but GEMINI_API_KEY is empty; falling back to tfidf_svd."
                )

        elif self.requested_backend == "sentence_transformers":
            try:
                from sentence_transformers import SentenceTransformer

                self._st_model = SentenceTransformer(model_name)
                self.active_backend = f"sentence_transformers:{model_name}"
                logger.info("Loaded SentenceTransformer model: %s", model_name)
            except Exception as exc:
                logger.warning(
                    "Falling back to TF-IDF+SVD embeddings because SentenceTransformer failed to load: %s",
                    exc,
                )
                self.active_backend = "tfidf_svd"

    def fit_corpus(self, texts: list[str]) -> None:
        """Fit pure-NumPy TF-IDF+SVD fallback projector (fast, <20ms) so fallback is always ready."""
        if not texts:
            return
        self._svd = PureNumpyTfidfSVD(max_features=3000, n_components=64).fit(texts)

    @staticmethod
    def _is_transient_error(exc: Exception) -> bool:
        msg = str(exc).lower()
        return any(m.lower() in msg for m in TRANSIENT_MARKERS)

    def _encode_gemini(self, texts: list[str]) -> np.ndarray:
        from google.genai import types

        assert self._gemini_client is not None
        chunks: list[np.ndarray] = []

        for start in range(0, len(texts), GEMINI_BATCH_SIZE):
            batch = texts[start : start + GEMINI_BATCH_SIZE]
            resp = None
            for attempt in range(1, 3):
                try:
                    resp = self._gemini_client.models.embed_content(
                        model=self.gemini_embedding_model,
                        contents=batch,
                        config=types.EmbedContentConfig(
                            output_dimensionality=self.gemini_embedding_dims
                        ),
                    )
                    break
                except Exception as exc:
                    if attempt < 2 and self._is_transient_error(exc):
                        time.sleep(self.retry_delay_seconds)
                        continue
                    raise

            assert resp is not None and resp.embeddings is not None
            arr = np.array([e.values for e in resp.embeddings], dtype=np.float32)
            chunks.append(arr)

        vecs = np.vstack(chunks) if len(chunks) > 1 else chunks[0]
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1.0, norms)
        normalized = (vecs / norms).astype(np.float32)
        self._gemini_ready_dim = normalized.shape[1]
        return normalized

    def encode(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, 1), dtype=np.float32)

        if self._gemini_client is not None:
            try:
                return self._encode_gemini(texts)
            except Exception as exc:
                logger.warning(
                    "Gemini embedding call failed; falling back gracefully: %s", exc
                )
                # If startup already indexed Gemini vectors, return neutral zero vectors
                # of matching dimension so cosine_similarity never hits a shape mismatch.
                if self._gemini_ready_dim is not None:
                    return np.zeros((len(texts), self._gemini_ready_dim), dtype=np.float32)
                # Startup failed before any Gemini vectors were indexed: permanently switch to tfidf_svd.
                self._gemini_client = None
                self.active_backend = "tfidf_svd"

        if self._st_model is not None:
            vecs = self._st_model.encode(
                texts,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
            return vecs.astype(np.float32)

        if self._svd is None:
            self.fit_corpus(texts)

        assert self._svd is not None
        return self._svd.transform_dense(texts)

    @staticmethod
    def cosine_similarity(vec_a: np.ndarray, matrix_b: np.ndarray) -> np.ndarray:
        """Assumes vec_a (d,) and matrix_b (n, d) are L2-normalized."""
        if matrix_b.shape[0] == 0:
            return np.array([], dtype=np.float32)
        if vec_a.shape[0] != matrix_b.shape[1]:
            return np.zeros(matrix_b.shape[0], dtype=np.float32)
        scores = np.dot(matrix_b, vec_a)
        return np.clip(scores, -1.0, 1.0)
