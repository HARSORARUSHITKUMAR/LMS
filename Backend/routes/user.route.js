import express from "express";
import { login, register } from "../controllers/user.controller.js";

const router = express.Router();

//define all rotes // endpoints
router.route("/register").post(register);
router.route("/login").post(login);


// api 
app.use()

export default router;