# ──────────────────────────────────────────────────────────────────────
# MES single-service image: build frontend (real mode) → serve via my-api
# ใช้กับ Render Web Service (Docker) — URL เดียว ไม่ต้องตั้ง CORS
# ──────────────────────────────────────────────────────────────────────

# ── Stage 1: build หน้าเว็บ (โหมดจริง ไม่ใช่ demo) ──
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
# override .env.production (VITE_DEMO_MODE=true) → ปิด mock ให้ยิง /api จริง
ENV VITE_DEMO_MODE=false
# VITE_API_BASE_URL ว่าง = same-origin → เรียก /api บนโดเมนเดียวกัน
ENV VITE_API_BASE_URL=
RUN npx vite build

# ── Stage 2: my-api + เสิร์ฟหน้าเว็บที่ build แล้ว ──
FROM node:20-alpine
WORKDIR /app
COPY my-api/package*.json ./
RUN npm install --omit=dev
COPY my-api/ ./
# เอา dist จาก stage แรกมาไว้ที่ ./public (server.js จะ auto-serve)
COPY --from=web /web/dist ./public
ENV NODE_ENV=production
EXPOSE 5099
CMD ["node", "server.js"]
