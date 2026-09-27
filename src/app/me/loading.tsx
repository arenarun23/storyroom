import Spinner from "@/components/Spinner";

// /me, /me/withdraw 전환 시 표시.
export default function MeLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper">
      <Spinner size={32} />
      <p className="text-sm text-muted">내 정보를 불러오는 중입니다...</p>
    </div>
  );
}
