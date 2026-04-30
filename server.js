const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Stripe server działa 🚀");
});

// 🔥 CREATE CHECKOUT
app.post("/create-checkout", async (req, res) => {
  try {
    const { cart, userId } = req.body;

    let suma = 0;
    cart.forEach(p => suma += p.cena);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "pln",
            product_data: {
              name: "Zamówienie Telegram"
            },
            unit_amount: suma * 100
          },
          quantity: 1
        }
      ],
      success_url: "https://google.com/success",
      cancel_url: "https://google.com/cancel",
      metadata: {
        userId
      }
    });

    return res.json({ url: session.url });

  } catch (err) {
    console.log("❌ Stripe error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 🔥 WEBHOOK
app.post("/webhook", bodyParser.raw({ type: "application/json" }), (req, res) => {
  const event = JSON.parse(req.body);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const userId = session.metadata.userId;

    console.log("💰 ZAPŁACONO:", userId);

    // 👉 WYSYŁKA DO TELEGRAMA
    axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      chat_id: userId,
      text: "✅ Płatność zakończona!"
    });
  }

  res.sendStatus(200);
});

app.listen(3000, () => console.log("Server działa"));
