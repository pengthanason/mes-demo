FROM node:20-alpine
WORKDIR /app
# NODE_ENV=production สำคัญ: ถ้าไม่ตั้ง Express default error handler จะแนบ stack trace ลง response (ข้อมูลภายในรั่ว)
# และเปิด fail-fast ของ db.js (บังคับให้ตั้ง DATABASE_URL/DB_PASSWORD จริง)
ENV NODE_ENV=production
# tzdata: alpine ไม่มี /usr/share/zoneinfo มาให้ → ตั้ง TZ=Asia/Bangkok แล้ว resolve ไม่ได้
# แล้ว "เงียบๆ กลับไปเป็น UTC" (เจอตอน deploy 2026-08-04 — env ตั้งถูกแต่ date ยังบอก UTC)
RUN apk add --no-cache tzdata
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 5099
CMD ["node", "server.js"]
