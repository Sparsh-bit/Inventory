"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { countryCodeFor, waLink } from "@/lib/whatsapp";
import { useOrg } from "@/components/app/org-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Phone number box + button that opens WhatsApp on that number with the bill typed in. */
export function WhatsAppShare({ text, defaultPhone = "", id = "wa-phone" }: { text: string; defaultPhone?: string; id?: string }) {
  const org = useOrg();
  const [phone, setPhone] = useState(defaultPhone);
  const wa = phone.trim() ? waLink(phone, text, countryCodeFor(org.currency)) : null;
  const invalid = phone.trim() !== "" && !wa;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Send bill on WhatsApp</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="Customer's mobile number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            e.stopPropagation(); // Enter here sends the bill; it doesn't trigger the surrounding form or dialog
            if (wa) window.open(wa, "_blank", "noopener");
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-err` : undefined}
        />
        {wa ? (
          <Button asChild className="bg-[#1fa855] text-white hover:bg-[#188a45]">
            <a href={wa} target="_blank" rel="noopener noreferrer">
              <MessageCircle /> WhatsApp
            </a>
          </Button>
        ) : (
          <Button disabled className="bg-[#1fa855] text-white">
            <MessageCircle /> WhatsApp
          </Button>
        )}
      </div>
      {invalid && <p id={`${id}-err`} className="text-xs text-destructive">Enter a 10-digit mobile number, or include the country code.</p>}
    </div>
  );
}
