import re


def normalize_space(value: str = "") -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def to_title_name(value: str = "") -> str:
    particles = {"DE", "DEL", "DELA", "DA", "VAN", "VON"}
    parts = []
    for part in normalize_space(value).replace(".", ". ").split():
        upper = part.upper().strip()
        if upper in particles:
            parts.append(upper.title())
        elif len(upper) == 1:
            parts.append(upper)
        else:
            parts.append(upper.title())
    return normalize_space(" ".join(parts))
