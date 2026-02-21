import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const features = [
  {
    title: "Autonomous Rebalancing",
    description:
      "Chainlink CRE orchestrates a 10-step workflow every 4 hours — fetching APYs, scoring risk, and executing optimal allocations via CCIP.",
    icon: "🤖",
  },
  {
    title: "Compliance Rails",
    description:
      "Every rebalance is validated against on-chain governance policy. Circuit breakers, proof-of-reserve checks, and stablecoin peg guards keep your treasury safe.",
    icon: "🛡️",
  },
  {
    title: "Full Transparency",
    description:
      "Every AI decision is stored on-chain. Browse the full history of Gemini rationales, protocol allocations, and tx hashes directly in the dashboard.",
    icon: "🔍",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-surface text-white">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center min-h-screen text-center px-4 overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(135deg, #0D47A1 0%, #1A1A2E 40%, #00BCD4 100%)",
            animation: "gradientShift 8s ease infinite",
            backgroundSize: "200% 200%",
          }}
        />
        <style>{`
          @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}</style>

        <div className="mb-4">
          <Badge variant="accent">Chainlink Convergence Hackathon 2026</Badge>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          Meet Your{" "}
          <span className="text-accent">AI CFO</span>
        </h1>
        <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mb-10">
          ChainCFO autonomously manages your DeFi treasury — optimizing yield across
          Aave, Compound, and Morpho with on-chain compliance rails powered by Chainlink.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-12">
          <Link
            href="/dashboard"
            className="bg-accent hover:bg-cyan-600 text-black font-bold px-8 py-4 rounded-xl text-lg transition-colors"
          >
            Launch App →
          </Link>
          <a
            href="https://github.com/UncleTom29/ChainCFO"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-card hover:bg-gray-700 text-white border border-gray-600 font-semibold px-8 py-4 rounded-xl text-lg transition-colors"
          >
            View on GitHub
          </a>
        </div>

        <Badge variant="default" className="text-sm px-4 py-1.5">
          ⬡ Powered by Chainlink CRE · CCIP · Data Feeds · Confidential HTTP · PoR
        </Badge>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-24">
        <h2 className="text-3xl font-bold text-center mb-12 text-white">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((f) => (
            <Card key={f.title} className="text-center">
              <div className="text-5xl mb-4">{f.icon}</div>
              <h3 className="text-xl font-bold mb-3 text-white">{f.title}</h3>
              <p className="text-gray-400 leading-relaxed">{f.description}</p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
