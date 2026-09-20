import { MarketingFooter, MarketingHeader } from "../../components/marketing/MarketingChrome";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#08080c] text-gray-200 flex flex-col">
      <MarketingHeader />
      <main className="flex-1 w-full">{children}</main>
      <MarketingFooter />
    </div>
  );
}
