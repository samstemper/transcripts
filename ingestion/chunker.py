"""Speaker-aware and token-aware transcript chunking."""

from __future__ import annotations

import re
from dataclasses import dataclass

import tiktoken

# Earnings transcripts in glopardo/sp500-earnings-transcripts use inline speaker
# turns like "...question? Tim Cook : Yes. If you look..." (space before colon,
# not necessarily a newline). Prose mentions like "CEO, Tim Cook, and he"
# are excluded because they are not followed by " : ".
SPEAKER_TURN_PATTERN = re.compile(
    r"(?:^|[.!?]\s+|\n\s*)"
    r"(Operator|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})"
    r"\s+:\s+",
    re.MULTILINE,
)


@dataclass
class Chunk:
    chunk_index: int
    chunk_text: str
    speaker: str | None
    token_count: int


def get_encoder(model: str = "text-embedding-3-small") -> tiktoken.Encoding:
    try:
        return tiktoken.encoding_for_model(model)
    except KeyError:
        return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str, enc: tiktoken.Encoding) -> int:
    return len(enc.encode(text))


def normalize_transcript(transcript: str) -> str:
    """Strip BOM and normalize whitespace."""
    text = transcript.replace("\ufeff", "").strip()
    return text


def split_by_speaker(transcript: str) -> list[tuple[str | None, str]]:
    """Split transcript into (speaker, speech) segments."""
    text = normalize_transcript(transcript)
    if not text:
        return []

    matches = list(SPEAKER_TURN_PATTERN.finditer(text))
    if not matches:
        return [(None, text)]

    segments: list[tuple[str | None, str]] = []

    if matches[0].start() > 0:
        preamble = text[: matches[0].start()].strip()
        if preamble:
            segments.append((None, preamble))

    for i, match in enumerate(matches):
        speaker = match.group(1).strip()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        speech = text[start:end].strip()
        if speech:
            segments.append((speaker, speech))

    return segments


def chunk_text_token_aware(
    text: str,
    enc: tiktoken.Encoding,
    chunk_size: int,
    overlap: int,
    speaker: str | None,
    start_index: int,
) -> list[Chunk]:
    """Split long speech into overlapping token-aware chunks."""
    tokens = enc.encode(text)
    if not tokens:
        return []

    chunks: list[Chunk] = []
    idx = start_index
    start = 0

    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text = enc.decode(chunk_tokens)

        chunks.append(
            Chunk(
                chunk_index=idx,
                chunk_text=chunk_text.strip(),
                speaker=speaker,
                token_count=len(chunk_tokens),
            )
        )
        idx += 1

        if end >= len(tokens):
            break
        start += chunk_size - overlap

    return chunks


def chunk_transcript(
    transcript: str,
    chunk_size: int = 512,
    overlap: int = 64,
    embedding_model: str = "text-embedding-3-small",
) -> list[Chunk]:
    """
    Chunk a transcript by speaker turn first, then by token windows for long turns.
    """
    enc = get_encoder(embedding_model)
    segments = split_by_speaker(transcript)

    all_chunks: list[Chunk] = []
    chunk_index = 0

    for speaker, text in segments:
        seg_tokens = count_tokens(text, enc)

        if seg_tokens <= chunk_size:
            if text.strip():
                all_chunks.append(
                    Chunk(
                        chunk_index=chunk_index,
                        chunk_text=text.strip(),
                        speaker=speaker,
                        token_count=seg_tokens,
                    )
                )
                chunk_index += 1
        else:
            sub_chunks = chunk_text_token_aware(
                text, enc, chunk_size, overlap, speaker, chunk_index
            )
            all_chunks.extend(sub_chunks)
            chunk_index += len(sub_chunks)

    if not all_chunks and normalize_transcript(transcript):
        all_chunks = chunk_text_token_aware(
            normalize_transcript(transcript), enc, chunk_size, overlap, None, 0
        )

    return all_chunks
