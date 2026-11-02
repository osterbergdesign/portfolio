# Contact form mailer — see server.py. Standard library only, so nothing to install.
FROM python:3.13-alpine
WORKDIR /app
COPY server.py .
ENV PYTHONUNBUFFERED=1
USER nobody
EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8000/api/health || exit 1
CMD ["python", "server.py"]
