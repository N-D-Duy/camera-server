FROM node:18-alpine

# Cài đặt ffmpeg và các công cụ cần thiết
RUN apk add --no-cache ffmpeg bash curl

WORKDIR /app

# Copy package.json trước để tận dụng Docker cache
COPY package*.json ./
RUN npm install && npm cache clean --force

# Copy source code
COPY . .

# Tạo thư mục lưu trữ với quyền phù hợp
RUN mkdir -p /app/recordings /app/database /app/recordings/temp && \
    chmod -R 777 /app/recordings /app/database /app/recordings/temp

# Make entrypoint script executable
RUN chmod +x /app/entrypoint.sh

# Expose ports
EXPOSE 8000
EXPOSE 8888

# Thêm healthcheck script
COPY <<EOF /healthcheck.sh
#!/bin/bash
if curl -f http://localhost:8000 >/dev/null 2>&1; then
  exit 0
else
  exit 1
fi
EOF

RUN chmod +x /healthcheck.sh

# Add healthcheck to monitor container health
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD /healthcheck.sh

# Use entrypoint script
ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]