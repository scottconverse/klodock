interface ToneSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function ToneSlider({ value, onChange }: ToneSliderProps) {
  const label =
    value < 0.3
      ? "Formal"
      : value < 0.5
        ? "Slightly formal"
        : value < 0.7
          ? "Balanced"
          : value < 0.9
            ? "Slightly casual"
            : "Casual";

  return (
    <div className="space-y-2">
      <label
        htmlFor="tone-slider"
        className="block text-sm font-medium text-neutral-700"
      >
        Tone
      </label>
      <input
        id="tone-slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="
          h-2 w-full cursor-pointer appearance-none rounded-lg
          bg-neutral-200 accent-primary-600
        "
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={label}
      />
      <div className="flex justify-between text-xs text-neutral-500">
        <span>Formal</span>
        <span className="font-medium text-primary-600">{label}</span>
        <span>Casual</span>
      </div>
    </div>
  );
}
