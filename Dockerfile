# Zeabur / Render / Fly.io 等 PaaS 自动构建用的 Dockerfile
FROM node:20-slim

WORKDIR /app

# 先拷贝依赖清单，利用 Docker 缓存层
COPY package.json package-lock.json ./
RUN npm install --production

# 再拷贝源码（依赖装好了再改源码不会触发重新 install）
COPY server.js ./
COPY AI-PM-Coach-在线测评.html ./
COPY admin.html ./

# 数据目录（Zeabur 上会把 Volume 挂载到这个目录）
RUN mkdir -p /data

EXPOSE 3001

# Zeabur 会自动注入 PORT 环境变量，优先使用
CMD ["node", "server.js"]
