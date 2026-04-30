const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();

// 🔥 STRIPE (MUSI BYĆ sk_test_ na Render)
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

console.log("KEY START:", process.env.STRIPE_SECRET_KEY?.slice(0, 8));

// middleware
app.use(cors());

// ⚠️ webhook musi być BEFORE json
app.post("/webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log("❌ Webhook error:", err.message);
      return res.sendStatus(400);
    }

    const sendToUser = async (chatId, text) => {
      try {
        await axios.post(
          `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text
          }
        );
      } catch (e) {
        console.log("Telegram error:", e.message);
      }
    };

    // ✅ SUCCESS PAYMENT
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      await sendToUser(
        session.metadata.userId,
        "✅ PŁATNOŚĆ ZAKOŃCZONA\nTwoje zamówienie zostało opłacone ✔"
      );
    }

    // ❌ FAILED PAYMENT
    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object;

      await sendToUser(
        session.metadata.userId,
        "❌ PŁATNOŚĆ ODRZUCONA\nSpróbuj ponownie"
      );
    }

    // ⌛ EXPIRED
    if (event.type === "checkout.session.expired") {
      const session = event.data.object;

      await sendToUser(
        session.metadata.userId,
        "⌛ PŁATNOŚĆ WYGASŁA"
      );
    }

    res.sendStatus(200);
  }
);

// JSON dla reszty endpointów
app.use(express.json());

// 🔥 HOME
app.get("/", (req, res) => {
  res.send("Stripe server działa 🚀");
});

// 🔥 CREATE CHECKOUT
app.post("/create-checkout", async (req, res) => {
  try {
    const { cart, userId } = req.body;

    let suma = 0;
    cart.forEach(p => suma += Number(p.cena) || 0);

    // minimum Stripe (2 PLN)
    if (suma < 2) suma = 2;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "pln",
            product_data: {
              name: "Zamówienie - sklepfortibot"
            },
            unit_amount: Math.round(suma * 100)
          },
          quantity: 1
        }
      ],

      // 🔥 WRACANIE DO BOTA
      success_url: `https://t.me/sklepfortibot?start=success`,
      cancel_url: `https://t.me/sklepfortibot?start=cancel`,

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

// start serwera
app.listen(3000, () => {
  console.log("🚀 Server działa na porcie 3000");
});
