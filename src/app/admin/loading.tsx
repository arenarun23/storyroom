import Spinner from "@/components/Spinner";

// /admin/* 전 구간 전환 시 표시(관리자 메뉴 클릭 직후 빈 화면 방지).
export default function AdminLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper">
      <Spinner size={32} />
      <p className="text-sm text-muted">관리자 데이터를 불러오는 중입니다...</p>
    </div>
  );
}
