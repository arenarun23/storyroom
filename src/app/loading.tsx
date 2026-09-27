import Spinner from "@/components/Spinner";

// 서버 컴포넌트 데이터 로딩 중 자동으로 표시되는 화면(Next.js App Router 규약).
// 페이지 전환 시 빈 화면 대신 이 화면이 즉시 뜬다.
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper">
      <Spinner size={32} />
      <p className="text-sm text-muted">불러오는 중입니다...</p>
    </div>
  );
}
