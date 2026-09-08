'use strict';

const Stripe = require('stripe');
const db = require('../db');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// ===== Price IDs (set in Stripe Dashboard) =====
const PRICES = {
  pro_monthly: process.env.STRIPE_PRICE_PRO || 'price_pro_monthly',
  business_monthly: process.env.STRIPE_PRICE_BUSINESS || 'price_business_monthly',
};

// ===== Create Checkout Session =====
async function createCheckoutSession(userId, plan) {
  const user = await db.findById('users', userId);
  if (!user) throw new Error('User not found');

  const priceId = PRICES[plan + '_monthly'];
  if (!priceId) throw new Error('Invalid plan');

  // Create or get Stripe customer
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: user.id } });
    customerId = customer.id;
    await db.update('users', userId, { stripe_customer_id: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.APP_URL || 'http://localhost:3000'}/app.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/app.html`,
    metadata: { userId, plan },
    subscription_data: { metadata: { userId, plan } },
    payment_intent_data: { receipt_email: user.email },
  });

  return { sessionId: session.id, url: session.url };
}

// ===== Create Billing Portal =====
async function createPortalSession(userId) {
  const user = await db.findById('users', userId);
  if (!user?.stripe_customer_id) throw new Error('No billing account');

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${process.env.APP_URL || 'http://localhost:3000'}/app.html`,
  });

  return { url: session.url };
}

// ===== Handle Webhook =====
async function handleWebhook(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { userId, plan } = session.metadata;
      if (!userId || !plan) break;

      const credits = plan === 'business' ? 500 : plan === 'pro' ? 100 : 10;
      await db.update('users', userId, {
        plan,
        credits,
        credits_used: 0,
        credits_reset_at: new Date(Date.now() + 30 * 86400000),
        stripe_subscription_id: session.subscription,
      });
      await db.insert('payments', { user_id: userId, amount: session.amount_total || 0, currency: session.currency || 'idr', status: 'completed', stripe_payment_id: session.payment_intent, description: `Upgrade to ${plan}` });
      console.log(`  ✓ User ${userId} upgraded to ${plan}`);
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (!userId) break;
      const status = sub.status;
      if (status === 'canceled' || status === 'unpaid') {
        await db.update('users', userId, { plan: 'free', credits: 10, stripe_subscription_id: null });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (!userId) break;
      await db.update('users', userId, { plan: 'free', credits: 10, stripe_subscription_id: null });
      console.log(`  ✓ User ${userId} downgraded to free`);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const userId = invoice.metadata?.userId || invoice.customer;
      console.log(`  ⚠ Payment failed for ${userId}`);
      break;
    }
  }
}

// ===== Check if Stripe is configured =====
function isStripeConfigured() {
  return process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('placeholder');
}

module.exports = { createCheckoutSession, createPortalSession, handleWebhook, isStripeConfigured, PRICES };
