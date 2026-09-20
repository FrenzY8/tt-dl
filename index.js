import express from "express";
import cors from "cors";
import downloadRouter from "./routes/download.js";
import watchRouter from "./routes/watch.js";

const app = express();

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
    res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Type, Content-Length, Content-Range, Accept-Ranges"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

app.get("/", (req, res) => {
    res.json({
        success: true,
        service: "TikTok Downloader API",
        endpoints: {
            download: "/api/download?url=https://www.tiktok.com/@user/video/123",
            watch: "/api/watch?url=TOKEN"
        }
    });
});

app.use("/api", downloadRouter);
app.use("/api", watchRouter);

app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found." });
});

const PORT = process.env.PORT || 3000;

if (!process.env.VERCEL) {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

export default app;