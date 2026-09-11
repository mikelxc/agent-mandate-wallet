'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import './wayleave-select.css';

type Choice = { value: string; label: string; description?: string };

export function WayleaveSelect({
  value,
  onValueChange,
  options,
  label,
  id,
  disabled,
  badge = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Choice[];
  label: string;
  id?: string;
  disabled?: boolean;
  badge?: boolean;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      items={options}
      disabled={disabled}
    >
      <Select.Trigger
        id={id}
        aria-label={label}
        className={`wayleave-select${badge ? ' wayleave-select--badge' : ''}`}
      >
        {badge && <span className="wayleave-select-dot" aria-hidden="true" />}
        <Select.Value className="wayleave-select-value" />
        <Select.Icon className="wayleave-select-chevron">
          <ChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          sideOffset={8}
          align="start"
          alignItemWithTrigger={false}
          className="wayleave-select-positioner"
        >
          <Select.Popup className="wayleave-select-popup">
            <div className="wayleave-select-heading">{label}</div>
            <Select.List className="wayleave-select-list">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  className="wayleave-select-option"
                >
                  <div className="wayleave-select-copy">
                    <Select.ItemText>{option.label}</Select.ItemText>
                    {option.description && <small>{option.description}</small>}
                  </div>
                  <Select.ItemIndicator className="wayleave-select-check">
                    <Check size={15} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
