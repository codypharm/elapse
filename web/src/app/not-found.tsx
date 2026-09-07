/**
 * App-wide 404. Branded like the checkout's "We can't find this checkout" state so a mistyped
 * URL never drops a visitor onto the framework's default white page.
 *
 * Maps to: design brief "do not" list (no unstyled framework pages).
 */
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/site/logo";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 py-5">
      <Link href="/" className="flex items-center !no-underline">
        <Logo />
      </Link>
      <section className="flex flex-1 flex-col justify-center gap-3 py-10">
        <h1 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.02em]">
          There&rsquo;s nothing here.
        </h1>
        <p className="max-w-[38ch] text-pretty text-ink-soft">
          Check the link, or start from the front page.
        </p>
        <Link href="/" className={cn(buttonVariants({ size: "lg" }), "mt-3 h-12 w-full text-base sm:w-auto")}>
          Go to Elapse
        </Link>
      </section>
    </main>
  );
}
