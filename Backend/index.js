import express from "express";
import dotenv from "dotenv";
import connectDB from "./database/dbConnect.js";

dotenv.config({});

// connect database connection
connectDB();
const app = express();

// default middleware
app.use(express.json());
app.use(cookieParser());

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
    console.log(`server is listing on port ${PORT}`);
})