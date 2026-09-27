import Link from "next/link";

// 존재하지 않는 경로나 삭제된 리소스(예: 영상 상세)에 접근했을 때 보여준다.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <p className="font-title text-lg font-bold text-ink">페이지를 찾을 수 없습니다</p>
      <p className="max-w-xs text-sm text-muted">주소가 바뀌었거나 삭제된 페이지일 수 있습니다.</p>
      <Link href="/" className="btn rounded-[10px] bg-teal px-5 text-sm font-semibold text-white">
        홈으로
      </Link>
    </div>
  );
}
