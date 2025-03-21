import Stripe from "stripe";
import { Course } from "../models/course.model.js";
import { CoursePurchase } from "../models/coursePurchase.model.js";
import { Lecture } from "../models/lecture.model.js";
import { User } from "../models/user.model.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createCheckoutSession = async (req, res) => {
    try {
        const userId = req.id;
        const { courseId } = req.body;

        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ message: "Course not found!" });

        // Create a new course purchase record
        const newPurchase = new CoursePurchase({
            courseId,
            userId,
            amount: course.coursePrice,
            status: "pending",
        });

        // Create a Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            billing_address_collection: "required",
            line_items: [
                {
                    price_data: {
                        currency: req.body.currency || "inr",
                        product_data: {
                            name: course.courseTitle,
                            images: [course.courseThumbnail],
                        },
                        unit_amount: course.coursePrice * 100, // Amount (lowest denomination)
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            success_url: `http://localhost:5173/course-progress/${courseId}`, // once payment successful redirect to course progress page
            cancel_url: `http://localhost:5173/course-detail/${courseId}`,
            metadata: {
                courseId: courseId,
                userId: userId,
            },
            shipping_address_collection: {
                allowed_countries: ["IN"], // Optionally restrict allowed countries
            },
        });

        if (!session.url) {
            return res
                .status(400)
                .json({ success: false, message: "Error while creating session" });
        }

        // Save the purchase record
        newPurchase.paymentId = session.id;
        await newPurchase.save();

        return res.status(200).json({
            success: true,
            url: session.url, // Return the Stripe checkout URL
        });
    } catch (error) {
        console.log(error);
    }
};

export const stripeWebhook = async (req, res) => {
    let event;
    const sig = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    try {
        // Verify Stripe webhook signature
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (error) {
        console.error("❌ Webhook verification failed:", error.message);
        return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    // Handle successful payment event
    if (event.type === "checkout.session.completed") {
        console.log("✅ Payment successful - updating purchase status");

        try {
            const session = event.data.object;
            const paymentId = session.id;

            // Find the purchase record
            const purchase = await CoursePurchase.findOne({ paymentId }).populate("courseId");

            if (!purchase) {
                console.error("❌ Purchase not found for payment ID:", paymentId);
                return res.status(404).json({ message: "Purchase not found" });
            }

            // Update purchase status to "completed"
            purchase.status = "completed";

            if (session.amount_total) {
                purchase.amount = session.amount_total / 100;
            }

            await purchase.save();

            // ✅ Unlock all lectures for the user
            if (purchase.courseId && purchase.courseId.lectures.length > 0) {
                await Lecture.updateMany(
                    { _id: { $in: purchase.courseId.lectures } },
                    { $set: { isPreviewFree: true } }
                );
            }

            // ✅ Add the course to the user's enrolledCourses
            await User.findByIdAndUpdate(
                purchase.userId,
                { $addToSet: { enrolledCourses: purchase.courseId._id } },
                { new: true }
            );

            // ✅ Add the user to the course's enrolledStudents list
            await Course.findByIdAndUpdate(
                purchase.courseId._id,
                { $addToSet: { enrolledStudents: purchase.userId } },
                { new: true }
            );

            console.log("🎉 Course purchase completed successfully!");
        } catch (error) {
            console.error("❌ Error updating purchase:", error);
            return res.status(500).json({ message: "Internal Server Error" });
        }
    }

    res.status(200).send();
};

export const getCourseDetailWithPurchaseStatus = async (req, res) => {
    try {
        const { courseId } = req.params;
        const userId = req.id;

        const course = await Course.findById(courseId)
            .populate({ path: "creator" })
            .populate({ path: "lectures" });

        const purchased = await CoursePurchase.findOne({ userId, courseId });
        console.log(purchased);

        if (!course) {
            return res.status(404).json({ message: "course not found!" });
        }

        return res.status(200).json({
            course,
            purchased: !!purchased, // true if purchased, false otherwise
        });
    } catch (error) {
        console.log(error);
    }
};

export const getAllPurchasedCourse = async (_, res) => {
    try {
        const purchasedCourse = await CoursePurchase.find({
            status: "completed",
        }).populate("courseId");
        if (!purchasedCourse) {
            return res.status(404).json({
                purchasedCourse: [],
            });
        }
        return res.status(200).json({
            purchasedCourse,
        });
    } catch (error) {
        console.log(error);
    }
};