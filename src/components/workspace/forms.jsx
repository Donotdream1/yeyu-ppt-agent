import React from "react";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
export function Field({ label, htmlFor, hint, children, className = "" }) {
  return (
    <div className={`field ${className}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
export function FormSelect({ children, ...props }) {
  return <SelectField {...props}>{children}</SelectField>;
}
