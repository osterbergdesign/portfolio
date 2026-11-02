# The editor and site builder. Its code and the site's files come from the repository,
# which docker-compose.yml mounts at /repo — so "Get updates" in the editor can update both.
FROM node:22-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git config --system --add safe.directory '*'
ENV ASTRO_TELEMETRY_DISABLED=1
WORKDIR /repo
EXPOSE 8081
HEALTHCHECK --interval=60s --timeout=5s --start-period=900s \
  CMD node -e "fetch('http://127.0.0.1:8081/__editor/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "/repo/editor/server.mjs"]
