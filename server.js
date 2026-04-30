const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();

// 🔥 STRIPE
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const ADMIN_ID = process.env.ADMIN_ID;

console.log("🚀 Server start:", process.env.STRIPE_SECRET_KEY?.slice(0, 8));

// =========================
// 🔥 MIDDLEWARE
// =========================
app.use(cors());

// =========================
// 🔥 WEBHOOK (MUSI BYĆ PRZED express.json)
// =========================
app.post(
  "/webhook",
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

    console.log("🔥 WEBHOOK:", event.type);

    const send = async (chatId, text) => {
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

    // =========================
    // 💰 SUCCESS PAYMENT
    // =========================
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId = session.metadata.userId;

      let cart = [];
      try {
        cart = JSON.parse(session.metadata.cart || "[]");
      } catch {}

      const itemsText = cart.length
        ? cart.map(p => `- ${p.nazwa} (${p.cena} PLN)`).join("\n")
        : "Brak danych";

      // 👤 USER
      await send(
        userId,
        "✅ PŁATNOŚĆ ZAKOŃCZONA\nTwoje zamówienie zostało przyjęte ✔"
      );

      // 👑 ADMIN
      if (ADMIN_ID) {
        await send(
          ADMIN_ID,
`🆕 NOWE ZAMÓWIENIE

👤 User ID: ${userId}
💰 Kwota: ${session.amount_total / 100} PLN

📦 Produkty:
${itemsText}

📌 Status: OPŁACONE`
        );
      }
    }

    // =========================
    // ❌ FAILED PAYMENT
    // =========================
    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object;

      await send(
        session.metadata.userId,
        "❌ PŁATNOŚĆ ODRZUCONA"
      );
    }

    // =========================
    // ⌛ EXPIRED
    // =========================
    if (event.type === "checkout.session.expired") {
      const session = event.data.object;

      await send(
        session.metadata.userId,
        "⌛ PŁATNOŚĆ WYGASŁA"
      );
    }

    res.sendStatus(200);
  }
);

// =========================
// JSON ROUTES
// =========================
app.use(express.json());

// =========================
// HOME
// =========================
app.get("/", (req, res) => {
  res.send("Stripe server działa 🚀");
});

// =========================
// CREATE CHECKOUT
// =========================
app.post("/create-checkout", async (req, res) => {
  try {
    const { cart, userId } = req.body;

    let suma = 0;
    cart.forEach(p => {
      suma += Number(p.cena) || 0;
    });

    if (suma < 2) suma = 2;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      line_items: [
        {
          price_data: {
            currency: "pln",
            product_data: {
              name: "Zamówienie - sklep"
            },
            unit_amount: Math.round(suma * 100)
          },
          quantity: 1
        }
      ],

      success_url: "https://t.me/sklepfortibot?start=success",
      cancel_url: "https://t.me/sklepfortibot?start=cancel",

      metadata: {
        userId,
        cart: JSON.stringify(cart)
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.log("❌ Stripe error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// =========================
// START SERVER
// =========================
app.listen(3000, () => {
  console.log("🚀 Server działa");
});
