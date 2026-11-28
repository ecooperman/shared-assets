import subprocess
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from shared_python import pages

# No database, no Alembic - this app has nothing but static files
# (theme.css/theme.js/icons.js) shared across the rest of the fleet. See
# README.md for what lives here and how consuming apps link to it.


def _get_git_sha() -> str:
    """Short commit hash the running app was deployed from, read straight
    from the repo on disk (the deploy pulls a real git checkout) - no CI
    wiring needed, and it can never drift from what's actually running.
    """
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=Path(__file__).resolve().parent.parent,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "unknown"


GIT_SHA = _get_git_sha()

app = FastAPI(title="shared-assets")


@app.get("/api/version")
def get_version():
    return {"version": GIT_SHA}


# `Cache-Control` for everything: `no-store`, except a script/stylesheet/image asked for with `?v=<hash>` (the address every app page uses, see
# shared_python/pages.py), which the browser keeps for a year. The address changes whenever the file does, so nothing is ever stale. Cloudflare's
# edge still bypasses the cache for this hostname (DEPLOYMENT.md, Cache Rule step).
pages.install_cache_headers(app)


app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn

    from .config import HOST, PORT

    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
