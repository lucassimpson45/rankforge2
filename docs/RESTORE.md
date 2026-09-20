# Restoring on a fresh Mac

1. `git clone https://github.com/lucassimpson45/rankforge2.git ~/Desktop/PROJECTS/RANKFORGE2`
2. `cd ~/Desktop/PROJECTS/RANKFORGE2 && npm install`
3. Create `.env` with `ELEVENLABS_API_KEY=...` (only needed for the goat avatar lines)
4. Tools: `brew install ffmpeg yt-dlp python3`, then `pip install curl_cffi` into yt-dlp's
   venv (`/opt/homebrew/Cellar/yt-dlp/*/libexec/bin/python -m pip install curl_cffi`), and
   `pip3 install numpy` for detection. Chrome must be logged into TikTok
   (`--cookies-from-browser chrome`).
5. Re-link the Claude Code skill so it's picked up:
   `ln -s ~/Desktop/PROJECTS/RANKFORGE2/skill/goatedrank-ranking-short ~/.claude/skills/goatedrank-ranking-short`
6. Optionally drop `docs/claude-memory-project_rankforge2.md` into
   `~/.claude/projects/-Users-lucassimpson/memory/project_rankforge2.md` and add its line to `MEMORY.md`.

The skill directory in this repo is the source of truth; `~/.claude/skills/...` is a symlink to it.
