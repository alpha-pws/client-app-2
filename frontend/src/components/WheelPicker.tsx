// Lightweight scroll-wheel picker built on a snap-to-interval ScrollView.
// Works in Expo Go (no native code), supports iOS/Android/Web.
// Props:
//   items:   array of strings shown in the wheel
//   value:   currently selected string (or undefined)
//   onChange:(string) => void
//   height:  visible height of wheel (default 180)
//   itemHeight: snap interval (default 40)
//   testID
//
// Notes:
// * Includes 2 spacer rows top + bottom so the selected row is centered.
// * Renders a faint highlighted center band.
// * Pure functional, no animations beyond native snap.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "@/src/theme";

export type WheelPickerProps = {
  items: string[];
  value?: string | null;
  onChange: (v: string) => void;
  height?: number;
  itemHeight?: number;
  testID?: string;
};

export function WheelPicker({
  items,
  value,
  onChange,
  height = 180,
  itemHeight = 40,
  testID,
}: WheelPickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const visibleRows = Math.max(3, Math.round(height / itemHeight));
  const half = Math.floor(visibleRows / 2);
  const padded = useMemo(() => {
    const spacers = Array(half).fill("");
    return [...spacers, ...items, ...spacers];
  }, [items, half]);

  const indexOf = (v?: string | null) => {
    if (v == null) return 0;
    const i = items.indexOf(v);
    return i >= 0 ? i : 0;
  };

  const [internalIndex, setInternalIndex] = useState<number>(indexOf(value));

  // Sync external value → scroll position.
  useEffect(() => {
    const i = indexOf(value);
    setInternalIndex(i);
    // delay to ensure layout
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: i * itemHeight, animated: false });
    });
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const i = Math.round(y / itemHeight);
    const clamped = Math.max(0, Math.min(items.length - 1, i));
    setInternalIndex(clamped);
    if (items[clamped] !== value) onChange(items[clamped]);
  };

  return (
    <View
      testID={testID}
      style={[styles.wrap, { height }]}
      // mouse-wheel support on web
      onWheel={Platform.OS === "web" ? (() => {}) as any : undefined}
    >
      {/* Highlighted center band */}
      <View
        pointerEvents="none"
        style={[
          styles.center,
          { top: half * itemHeight, height: itemHeight },
        ]}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumEnd}
        // Web fallback: react to scrollEnd
        onScrollEndDrag={Platform.OS === "web" ? onMomentumEnd : undefined}
        contentContainerStyle={{ paddingHorizontal: 0 }}
        scrollEventThrottle={32}
      >
        {padded.map((it, idx) => {
          const isSpacer = idx < half || idx >= items.length + half;
          const realIdx = idx - half;
          const dist = Math.abs(realIdx - internalIndex);
          const opacity = isSpacer ? 0 : Math.max(0.18, 1 - dist * 0.28);
          const scale = isSpacer ? 1 : Math.max(0.86, 1 - dist * 0.06);
          return (
            <View
              key={`${it}-${idx}`}
              style={[styles.row, { height: itemHeight }]}
            >
              <Text
                style={[
                  styles.label,
                  {
                    opacity,
                    transform: [{ scale }],
                    fontWeight: dist === 0 ? "800" : "500",
                    color: dist === 0 ? colors.primary : colors.text,
                  },
                ]}
              >
                {it}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Convenience to make numeric ranges */
export function makeRange(from: number, to: number, step = 1, suffix = ""): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i += step) {
    out.push(`${i}${suffix}`);
  }
  return out;
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    width: "100%",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    position: "relative",
  },
  center: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: colors.muted,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  row: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 18,
    color: colors.text,
  },
});
