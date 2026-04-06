# Datatrixs - Financial Intelligence for PE

This is a NextJS application for Private Equity firms to manage and aggregate financial data from multiple retail locations using AI-powered insights.

## Stripe Configuration

### API Version
The application is configured to use Stripe API version: **2026-03-25.dahlia**.

### Webhook Setup
To ensure subscription statuses and license limits are synchronized automatically, you must configure a webhook in your [Stripe Dashboard](https://dashboard.stripe.com/webhooks):

1.  **Endpoint URL**: `https://<your-deployed-domain>/api/webhooks/stripe`
    *   *Note: For local development, use the Stripe CLI to forward events: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`*
2.  **Select Events**:
    *   `checkout.session.completed`
    *   `customer.subscription.updated`
    *   `customer.subscription.deleted`
3.  **Environment Variables**:
    *   Ensure `STRIPE_WEBHOOK_SECRET` is added to your environment variables. 
    *   *Note: When using the Stripe CLI for local testing, the command output will provide a secret starting with `whsec_`. Use this value.*

## Pricing Model (Branding)

*   **Datatrixs Portfolio Core** (Base SaaS Fee): $3,333/mo ($33,200/yr)
*   **Entity Connection License** (Per Location): $278/mo ($2,760/yr)
*   **Annual Discount**: 17% automatically applied for yearly commitments.

## Core Features

*   **Grounded AI Analyst**: Chat with your live financial data.
*   **Automated Normalization**: Standardize disparate CSV/Excel data into a global Chart of Accounts (COA).
*   **License Guard**: Automatic enforcement of unit capacity based on the active subscription.
