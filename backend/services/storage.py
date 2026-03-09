"""Supabase Storage helpers — uses the service role key so bucket creation
and uploads work without any manual dashboard setup or RLS policies.
"""

import uuid
from supabase import create_client, Client
from config import settings

_client: Client | None = None
_ensured_buckets: set[str] = set()


def _get_client() -> Client:
    global _client
    if _client is None:
        # Service role key: bypasses RLS, can create/manage buckets
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


def ensure_bucket(bucket: str) -> None:
    """Create the bucket if it doesn't already exist (idempotent)."""
    if bucket in _ensured_buckets:
        return
    client = _get_client()
    existing = [b.name for b in client.storage.list_buckets()]
    if bucket not in existing:
        client.storage.create_bucket(bucket, options={"public": True})
        print(f"  Created bucket: {bucket}")
    _ensured_buckets.add(bucket)


def upload_file(file_bytes: bytes, filename: str, bucket: str = "assets") -> str:
    """Upload bytes to a Supabase Storage bucket and return the public URL."""
    client = _get_client()
    ensure_bucket(bucket)

    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    key = f"{uuid.uuid4()}.{ext}"

    client.storage.from_(bucket).upload(
        path=key,
        file=file_bytes,
        file_options={"content-type": _mime(ext), "upsert": "false"},
    )

    return client.storage.from_(bucket).get_public_url(key)


def _mime(ext: str) -> str:
    mapping = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif",
        "webp": "image/webp",
        "svg": "image/svg+xml",
        "mp4": "video/mp4",
        "mov": "video/quicktime",
        "webm": "video/webm",
    }
    return mapping.get(ext.lower(), "application/octet-stream")
