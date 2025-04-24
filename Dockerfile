FROM node:18-alpine

RUN apk add --no-cache ffmpeg bash curl

WORKDIR /app

COPY package*.json ./
RUN npm install && npm cache clean --force

COPY . .

RUN mkdir -p /app/recordings /app/database /app/recordings/temp && \
    chmod -R 777 /app/recordings /app/database /app/recordings/temp

RUN chmod +x /app/entrypoint.sh

EXPOSE 8000
EXPOSE 8888

COPY <<EOF /healthcheck.sh
#!/bin/bash
if curl -f http://localhost:8000 >/dev/null 2>&1; then
  exit 0
else
  exit 1
fi
EOF

RUN chmod +x /healthcheck.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD /healthcheck.sh

ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]
