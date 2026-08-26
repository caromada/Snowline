"""Entity resolution: extracted location text -> gazetteer pass slug.

"the pass after Rae Lakes", "Glen", and "Glen Pass" are one place. The
extracted location field gets first shot; the post title and body are
fallbacks, because plenty of posts name the pass only in the title.
"""

from __future__ import annotations

from typing import Any

from gazetteer import resolve as gaz_resolve


def resolve_post(extraction: dict[str, Any], post: dict[str, Any]) -> str | None:
    for candidate in (
        extraction.get("location"),
        post.get("title"),
        (post.get("text") or "")[:300],
    ):
        slug = gaz_resolve(candidate)
        if slug:
            return slug
    return None
