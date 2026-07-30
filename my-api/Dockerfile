FROM node:20-alpine
WORKDIR /app
# NODE_ENV=production สำคัญ: ถ้าไม่ตั้ง Express default error handler จะแนบ stack trace ลง response (ข้อมูลภายในรั่ว)
# และเปิด fail-fast ของ db.js (บังคับให้ตั้ง DATABASE_URL/DB_PASSWORD จริง)
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 5099
CMD ["node", "server.js"]
