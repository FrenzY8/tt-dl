import express from "express";
import cors from "cors";
import downloadRouter from "./routes/download.js";
import watchRouter from "./routes/watch.js";
import searchRouter from "./routes/search.js"
const app = express();

app.use(cors({
    origin: "*",
    methods: ["GET", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Range"],
    exposedHeaders: [
        "Content-Type",
        "Content-Length",
        "Content-Range",
        "Accept-Ranges"
    ]
}));

app.options(/.*/, cors());

app.use(express.json());

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
app.use("/api", searchRouter);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found."
    });
});

const PORT = process.env.PORT || 3000;

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

export default app;