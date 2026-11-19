package cx.lpm.mobile.core.demo

// Fixture file contents served by `fileChunk`.

/** A file's text: what the phone's editor saved into it, else the fixture. */
internal fun DemoServer.demoFileText(project: String, path: String): String =
    world.fileEdits["$project\n$path"] ?: demoFileContent(project, path)

internal fun demoFileContent(project: String, path: String): String = when {
    path == "package.json" && project.startsWith("storefront") -> storefrontPackageJson
    path == "components/CheckoutForm.tsx" -> checkoutFormTsx
    path == "app/checkout/page.tsx" -> checkoutPageTsx
    path == "lib/payments.ts" -> paymentsTs
    path == "README.md" && project.startsWith("storefront") -> storefrontReadme
    else -> fallbackFile(project, path)
}

private fun fallbackFile(project: String, path: String): String {
    val name = path.swiftSplit('/').lastOrNull() ?: path
    if (path.endsWith(".md")) {
        return "# $name\n\nNotes for the $project project.\n"
    }
    if (path.endsWith(".json")) {
        return "{\n  \"name\": \"$project\",\n  \"version\": \"0.1.0\",\n  \"private\": true\n}\n"
    }
    if (path.endsWith(".go")) {
        return "package main\n\nimport \"log\"\n\n" +
            "func main() {\n\tlog.Println(\"$project starting\")\n}\n"
    }
    return "// $name\n// Part of the $project project.\nexport {}\n"
}

private val storefrontPackageJson = """
    {
      "name": "storefront",
      "version": "1.4.2",
      "private": true,
      "scripts": {
        "dev": "next dev",
        "api": "npm run api",
        "worker": "npm run worker",
        "build": "next build",
        "test": "vitest run",
        "lint": "next lint"
      },
      "dependencies": {
        "next": "15.3.2",
        "react": "19.1.0",
        "react-dom": "19.1.0",
        "zod": "3.24.1"
      },
      "devDependencies": {
        "typescript": "5.8.2",
        "vitest": "3.1.4"
      }
    }
""".trimIndent()

private val checkoutFormTsx = """
    "use client"

    import { useState } from "react"
    import { z } from "zod"
    import { createPaymentIntent } from "../lib/payments"

    const checkoutSchema = z.object({
      email: z.string().email("Enter a valid email"),
      name: z.string().min(2, "Enter the name on the card"),
      card: z.string().regex(/^\d{16}$/, "Enter a 16-digit card number"),
      expiry: z.string().regex(/^\d{2}\/\d{2}$/, "Use MM/YY"),
      cvc: z.string().regex(/^\d{3,4}$/, "Enter the security code"),
    })

    type Errors = Partial<Record<string, string>>

    export function CheckoutForm({ total }: { total: number }) {
      const [errors, setErrors] = useState<Errors>({})
      const [submitting, setSubmitting] = useState(false)

      async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const parsed = checkoutSchema.safeParse(Object.fromEntries(form))
        if (!parsed.success) {
          setErrors(Object.fromEntries(
            parsed.error.issues.map(issue => [issue.path[0], issue.message]),
          ))
          return
        }
        setErrors({})
        setSubmitting(true)
        try {
          await createPaymentIntent({ amount: total, email: parsed.data.email })
        } finally {
          setSubmitting(false)
        }
      }

      return (
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field name="email" label="Email" error={errors.email} />
          <Field name="name" label="Name on card" error={errors.name} />
          <Field name="card" label="Card number" error={errors.card} inputMode="numeric" />
          <div className="grid grid-cols-2 gap-4">
            <Field name="expiry" label="Expiry" error={errors.expiry} placeholder="MM/YY" />
            <Field name="cvc" label="CVC" error={errors.cvc} inputMode="numeric" />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Processing…" : "Pay now"}
          </button>
        </form>
      )
    }
""".trimIndent()

private val checkoutPageTsx = """
    import { CheckoutForm } from "../../components/CheckoutForm"
    import { OrderSummary } from "../../components/OrderSummary"
    import { getCart } from "../../lib/cart"

    export const metadata = { title: "Checkout — storefront" }

    export default async function CheckoutPage() {
      const cart = await getCart()
      return (
        <main className="mx-auto max-w-2xl px-6 py-12">
          <h1 className="text-2xl font-semibold">Checkout</h1>
          <OrderSummary items={cart.items} total={cart.total} />
          <CheckoutForm total={cart.total} />
        </main>
      )
    }
""".trimIndent()

private val paymentsTs = """
    import { z } from "zod"

    const intentResponse = z.object({
      id: z.string(),
      clientSecret: z.string(),
      status: z.enum(["requires_confirmation", "succeeded"]),
    })

    export type PaymentIntent = z.infer<typeof intentResponse>

    export async function createPaymentIntent(input: { amount: number; email: string }) {
      const res = await fetch("/api/payments/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error("Payment intent failed")
      return intentResponse.parse(await res.json())
    }

    export function formatAmount(cents: number) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(cents / 100)
    }
""".trimIndent()

private val storefrontReadme = """
    # storefront

    A demo Next.js shop: product pages, a cart, and a checkout flow.

    ## Getting started

    - `npm install`
    - `npm run dev` — web on :3000
    - `npm run api` — API on :4000

    ## Scripts

    - `npm test` — run the unit tests
    - `npm run lint` — lint the codebase

    ## Structure

    - `app/` — routes (App Router)
    - `components/` — UI components
    - `lib/` — payments, cart, and API helpers
""".trimIndent()
