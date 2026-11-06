import * as Dialog from "@radix-ui/react-dialog";
import { X, WarningCircle } from "@phosphor-icons/react";
import {
  Component,
  cloneElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

export function Modal({
  title,
  description,
  children,
  close,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog ${wide ? "dialog-wide" : ""}`}>
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description>{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="icon-button" aria-label="닫기">
              <X size={22} />
            </Dialog.Close>
          </div>
          {!description && (
            <Dialog.Description className="sr-only">
              {title} 내용을 확인하고 입력해 주세요.
            </Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  wide?: boolean;
}) {
  const id = useId();
  const input = children as ReactElement<{
    id?: string;
    "aria-describedby"?: string;
  }>;
  const describedBy = [
    input.props["aria-describedby"],
    hint ? `${id}-hint` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={`field ${wide ? "field-wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(input, {
        id,
        "aria-describedby": describedBy || undefined,
      })}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error-box" role="alert">
      <WarningCircle size={20} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Empty({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function Tag({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
export function Money({ value }: { value: number }) {
  return <>{value.toLocaleString("ko-KR")}원</>;
}
// 화면을 그리다 예상하지 못한 오류가 나도 빈 화면 대신 다시 불러오기를 안내한다.
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { message: string }
> {
  state = { message: "" };
  static getDerivedStateFromError(error: Error) {
    return { message: error.message || "알 수 없는 오류" };
  }
  render() {
    if (!this.state.message) return this.props.children;
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <WarningCircle size={42} />
          <h2>화면을 표시하지 못했어요</h2>
          <ErrorBox message={this.state.message} />
          <p>저장된 데이터는 그대로 두었어요. 화면을 다시 불러와 주세요.</p>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            화면 다시 불러오기
          </button>
        </div>
      </div>
    );
  }
}
