import { MarketingFooter, MarketingHeader } from "../../components/marketing/MarketingChrome";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f1e7] text-[#5c5052] flex flex-col">
      <MarketingHeader />
      <main className="flex-1 w-full">{children}</main>
      <MarketingFooter />
    </div>
  );
}
