import Foundation

// Seed notes for Demo Mode, oldest first — a developer's working notebook while
// a checkout redesign goes from kickoff to review. Split out of `DemoNotes` so
// that file stays handler-sized. The checkout thread is deliberately longer than
// one page, so paging and a short final page both happen for a reviewer.

let demoCheckoutNotes: [String] = [
    "Kickoff: checkout becomes two columns — form on the left, order summary pinned on the right.",
    "Open question for design: at what width does the summary column collapse?",
    "Keep the existing form component. Its validation is the only part with real test coverage.",
    "Totals live in lib/cart.ts. The summary reads from there and never recomputes its own.",
    "Design came back: the summary collapses into an accordion below 768px.",
    "Scope for this pass is card and Apple Pay. No other wallets.",
    "Promo codes move to the next pass — the pricing rules aren't settled.",
    "Create the payment intent before submit so a decline doesn't wipe the form.",
    "Module name settled: lib/payments.ts, with createPaymentIntent(cart, method).",
    "A declined card comes back as 402 with an empty body, so the message the shopper sees is ours to write.",
    "Decline copy: \"Payment failed. Please try again.\" Nothing about the card itself.",
    "Double submit fires two intents. Disable the button while a submit is in flight.",
    "Button now reads \"Placing order…\" while submitting.",
    "Apple Pay needs a merchant id in the environment file — ask ops for the sandbox one.",
    "Got the sandbox merchant id. Added it to the example environment file as a placeholder.",
    "Picker shows card and Apple Pay side by side, and hides Apple Pay when the device can't pay.",
    "Careful: the can-pay check is async. Render the picker after it settles or it flickers.",
    "Held the picker until the check settles. No more flicker.",
    "The order summary recomputes on every keystroke. Very noticeable on a slow phone.",
    "Memoized the totals on the cart items and the selected method. Typing is smooth again.",
    "Note for the reviewer: explain why the intent is created early — it isn't obvious from the diff.",
    "An empty cart can reach checkout through a stale link. Redirect to the cart page.",
    "Added the redirect plus a short line of copy so it doesn't read as an error.",
    "Shipping is still a flat rate. Real rates are a separate project.",
    "Accessibility pass: the summary column needs a heading so it isn't an unlabelled region.",
    "Added a heading to the summary and labelled the payment picker as a radio group.",
    "Keyboard order was wrong on mobile — the summary came before the form in the markup.",
    "Reordered the markup and used grid areas so the visual order stays the same.",
    "End-to-end run failed once with a timeout in the payment mock. Passed on a rerun.",
    "Second failure in the same spot. Not a fluke.",
    "The mock resolves after the assertion when the runner is cold — about one run in five.",
    "Warming the mock with a throwaway call in the setup fixes it locally.",
    "Suite ran clean three times in a row with the warmup in place.",
    "Grabbing screenshots for review: mobile breakpoint with the accordion open.",
    "Mock of the summary card at the mobile breakpoint — this is the spacing we agreed on.",
    "Copy check: \"Pay $50.00\" on the button reads better than \"Place order\".",
    "Analytics: fire the checkout-started event when the intent is created, not on page view.",
    "Otherwise every bounce out of the cart looks like an abandoned checkout.",
    "Put an error boundary around the summary so a totals bug can't take the form down with it.",
    "Tested with a card that declines twice then succeeds. Form state survives all three attempts.",
    "On a slow connection the spinner runs long enough that people tap again — pointer events off while submitting.",
    "Rounding check: amounts stay in minor units until the last formatting call.",
    "Confirmed the API expects minor units too, so nothing converts on the way out.",
    "README needs a paragraph on the payments environment variable before this merges.",
    "Added the payments section to the README.",
    "Dark mode: the inline error is barely readable on the dark surface.",
    "Moved the error text to the stronger red token. Contrast passes now.",
    "Left the promo code field out entirely rather than shipping it disabled.",
    "Before review: squash the three fixup commits.",
    "Test count is 25 across three files, all green.",
    "One more pass over the diff for stray logging.",
    "Found two log lines in the payments module and removed them.",
    "Branch is ready for review as soon as the end-to-end suite runs clean in CI.",
    "Post in the design review channel once the pull request is open.",
]

let demoIdeaNotes: [String] = [
    "Saved payment methods — needs accounts first, so it waits on the auth work.",
    "Order tracking on one URL with a signed token in the link, no login.",
    "Gift notes at checkout. Cheap to build; ask support whether anyone actually asks for it.",
    "Fold the cart and checkout analytics into one dashboard instead of two.",
    "Try a one-page checkout for returning shoppers and measure it against the current flow.",
    "Address autocomplete would cut the form roughly in half on mobile.",
    "Wishlist to cart in one tap from the product grid.",
    "A post-purchase upsell is tempting, but keep the confirmation page calm for now.",
]

let demoStorefrontGeneralNotes: [String] = [
    "Deploys go out Tuesday and Thursday mornings unless something is on fire.",
    "The staging payment key only accepts the test cards listed in the payments README.",
    "Product images are served from the image CDN — don't add new ones to the repository.",
    "Weekly sync moved to Wednesday.",
]

let demoGatewayNotes: [String] = [
    "Upstream timeout is 5s. Anything slower is a bug on their side, not ours.",
    "Rate limits are read from the gateway config at boot, and only at boot for now.",
    "The health check returns 200 only when every upstream answers.",
    "Keep the proxy hot path allocation free — profile before merging anything into it.",
]

let demoMobileNotes: [String] = [
    "Startup budget is two seconds cold on a mid-range device.",
    "Auth tokens live in the secure store. Never log them, not even truncated.",
    "The bundler cache goes stale after a dependency bump — clear it before chasing a ghost.",
]
