"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

export function PasswordInput(props: React.ComponentProps<typeof InputGroupInput>) {
  const [show, setShow] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput type={show ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
