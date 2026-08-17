import subprocess
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

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


@app.middleware("http")
async def no_cache(request: Request, call_next):
    """Never let the browser serve a stale copy - matters more here than
    anywhere else in the fleet, since 100% of this app's traffic is
    cacheable-by-extension static assets (theme.css/theme.js/icons.js). This
    header alone isn't enough once Cloudflare's edge is in front of it - see
    DEPLOYMENT.md's Cache Rule bypass step, required for this hostname too.
    `no-store` (not `no-cache`) is deliberate: `no-cache` still permits
    caching as long as the cache revalidates first, which isn't guaranteed;
    `no-store` is the only unambiguous "never cache this, anywhere" signal.
    """
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn

    from .config import HOST, PORT

    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
