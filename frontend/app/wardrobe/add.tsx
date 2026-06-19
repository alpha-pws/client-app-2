import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api, Category } from "@/src/api";
import {
  compressImage,
  isUploadError,
  MAX_BASE64_BYTES,
  UploadError,
  UploadProgress,
  withRetry,
} from "@/src/upload";
import { colors, spacing, typography } from "@/src/theme";

const PRIVACY = [
  { id: "public", label: "Public" },
  { id: "friends", label: "Friends" },
  { id: "private", label: "Private" },
];

export default function AddWardrobe() {
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageSizeBytes, setImageSizeBytes] = useState<number | null>(null);
  const [category, setCategory] = useState<string>("tops");
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [rating, setRating] = useState(4);
  const [privacy, setPrivacy] = useState("friends");
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => {});
  }, []);

  // Cancel in-flight upload if user leaves screen.
  useEffect(() => () => abortRef.current?.abort(), []);

  const addCustomCategory = async () => {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    try {
      const c = await api.addCategory(newCatName.trim());
      const fresh = await api.listCategories();
      setCategories(fresh);
      setCategory(c.id);
      setNewCatName("");
      setShowCatModal(false);
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally {
      setAddingCat(false);
    }
  };

  const removeCustomCategory = async (cid: string) => {
    try {
      await api.deleteCategory(cid);
      const fresh = await api.listCategories();
      setCategories(fresh);
      if (category === cid) setCategory("tops");
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
  };

  const ensureCameraPermission = async () => {
    const { status, canAskAgain } = await ImagePicker.getCameraPermissionsAsync();
    if (status === "granted") return true;
    if (canAskAgain) {
      const res = await ImagePicker.requestCameraPermissionsAsync();
      if (res.status === "granted") return true;
    }
    Alert.alert(
      "Camera Permission",
      "Enable camera access in Settings to take photos.",
      [
        { text: "Open Settings", onPress: () => Linking.openSettings() },
        { text: "Cancel", style: "cancel" },
      ],
    );
    return false;
  };

  const ensureGalleryPermission = async () => {
    const { status, canAskAgain } = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (status === "granted") return true;
    if (canAskAgain) {
      const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (res.status === "granted") return true;
    }
    Alert.alert(
      "Photos Permission",
      "Enable photo library access in Settings to pick images.",
      [
        { text: "Open Settings", onPress: () => Linking.openSettings() },
        { text: "Cancel", style: "cancel" },
      ],
    );
    return false;
  };

  const fromCamera = async () => {
    setRequesting(true);
    setUploadError(null);
    try {
      if (!(await ensureCameraPermission())) return;
      const r = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1, // capture full quality; we compress on save
      });
      if (!r.canceled && r.assets[0]?.uri) {
        setImageUri(r.assets[0].uri);
        setImageSizeBytes(r.assets[0].fileSize ?? null);
      }
    } finally {
      setRequesting(false);
    }
  };

  const fromGallery = async () => {
    setRequesting(true);
    setUploadError(null);
    try {
      if (!(await ensureGalleryPermission())) return;
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });
      if (!r.canceled && r.assets[0]?.uri) {
        setImageUri(r.assets[0].uri);
        setImageSizeBytes(r.assets[0].fileSize ?? null);
      }
    } finally {
      setRequesting(false);
    }
  };

  const save = async () => {
    if (!imageUri) {
      Alert.alert("Photo required", "Take or pick a photo first.");
      return;
    }
    setSaving(true);
    setUploadError(null);
    setProgress({ stage: "compressing", attempt: 0, totalAttempts: 3, percent: 10, message: "Optimizing photo…" });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 1) Compress.
      const compressed = await compressImage(imageUri);
      if (compressed.approxBytes > MAX_BASE64_BYTES) {
        // eslint-disable-next-line no-console
        console.warn("[upload] still too large after compression", {
          approxBytes: compressed.approxBytes,
          max: MAX_BASE64_BYTES,
        });
        setUploadError({
          code: "too_large",
          message: "Photo is still too large after compression. Try a smaller or simpler image.",
          attempts: 0,
        });
        return;
      }
      setProgress({
        stage: "uploading",
        attempt: 1,
        totalAttempts: 3,
        percent: 35,
        message: "Uploading to closet…",
      });

      // 2) Upload with retry + per-attempt timeout.
      await withRetry(
        (signal) =>
          api.addWardrobeItem(
            {
              image_base64: compressed.base64,
              category,
              name: name || undefined,
              color: color || undefined,
              rating,
              privacy,
            },
            signal,
          ),
        {
          totalAttempts: 3,
          baseDelayMs: 600,
          timeoutMs: 60_000,
          abortSignal: controller.signal,
          onProgress: setProgress,
        },
      );

      router.back();
    } catch (e: any) {
      if (isUploadError(e)) {
        setUploadError(e);
        // eslint-disable-next-line no-console
        console.error("[upload] failed", e);
      } else {
        setUploadError({
          code: "unknown",
          message: e?.message || "Upload failed for an unknown reason.",
          attempts: 0,
        });
        // eslint-disable-next-line no-console
        console.error("[upload] non-classified failure", e);
      }
    } finally {
      abortRef.current = null;
      setSaving(false);
    }
  };

  const cancelUpload = () => {
    abortRef.current?.abort();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="wardrobe-add-screen">
      <View style={styles.headerBar}>
        <TouchableOpacity testID="add-back-button" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Item</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {imageUri ? (
            <View>
              <Image source={{ uri: imageUri }} style={styles.preview} />
              <TouchableOpacity
                testID="retake-button"
                style={styles.retakeBtn}
                onPress={() => {
                  setImageUri(null);
                  setImageSizeBytes(null);
                  setUploadError(null);
                }}
                disabled={saving}
              >
                <Ionicons name="refresh" size={14} color={colors.primary} />
                <Text style={styles.retakeText}>Retake / Re-pick</Text>
              </TouchableOpacity>
              {imageSizeBytes != null && (
                <Text style={styles.imageMeta}>
                  Original: {(imageSizeBytes / 1024 / 1024).toFixed(2)} MB · auto-compressed before upload
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.captureRow}>
              <TouchableOpacity testID="camera-button" style={styles.captureBtn} onPress={fromCamera} disabled={requesting}>
                {requesting ? (
                  <ActivityIndicator color={colors.primaryFg} />
                ) : (
                  <>
                    <Ionicons name="camera" size={32} color={colors.primaryFg} />
                    <Text style={styles.captureText}>Camera</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity testID="gallery-button" style={[styles.captureBtn, styles.captureBtnGhost]} onPress={fromGallery} disabled={requesting}>
                <Ionicons name="images" size={32} color={colors.primary} />
                <Text style={[styles.captureText, { color: colors.primary }]}>Gallery</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.sectionLabel}>CATEGORY</Text>
          <View style={styles.chipsWrap}>
            {categories.map((c) => {
              const active = category === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  testID={`category-chip-${c.id}`}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setCategory(c.id)}
                  onLongPress={() => {
                    if (!c.built_in) {
                      Alert.alert(
                        "Remove category?",
                        `Delete "${c.name}"? Existing items keep their category.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive", onPress: () => removeCustomCategory(c.id) },
                        ],
                      );
                    }
                  }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                  {!c.built_in && (
                    <Text style={[styles.chipBadge, active && { color: colors.primaryFg }]}>·</Text>
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              testID="add-category-chip"
              style={[styles.chip, { borderStyle: "dashed" }]}
              onPress={() => setShowCatModal(true)}
            >
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={[styles.chipText, { marginLeft: 4 }]}>New</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>NAME</Text>
          <TextInput
            testID="item-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Blue striped tee"
            placeholderTextColor={colors.subtle}
            style={styles.input}
          />

          <Text style={styles.sectionLabel}>COLOR</Text>
          <TextInput
            testID="item-color-input"
            value={color}
            onChangeText={setColor}
            placeholder="Navy"
            placeholderTextColor={colors.subtle}
            style={styles.input}
          />

          <Text style={styles.sectionLabel}>HOW MUCH DO YOU LIKE IT?</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <TouchableOpacity
                key={s}
                testID={`rating-star-${s}`}
                onPress={() => setRating(s)}
                style={styles.star}
              >
                <Ionicons
                  name={s <= rating ? "star" : "star-outline"}
                  size={32}
                  color={s <= rating ? colors.primary : colors.subtle}
                />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>VISIBLE TO</Text>
          <View style={styles.chipsWrap}>
            {PRIVACY.map((p) => {
              const active = privacy === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  testID={`privacy-chip-${p.id}`}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setPrivacy(p.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {progress && saving && (
            <View style={styles.progressCard} testID="upload-progress">
              <View style={styles.progressHeaderRow}>
                <Text style={styles.progressTitle}>
                  {progress.stage === "compressing" && "Optimizing"}
                  {progress.stage === "uploading" && "Uploading"}
                  {progress.stage === "retrying" && `Retrying ${progress.attempt}/${progress.totalAttempts}`}
                  {progress.stage === "done" && "Done"}
                  {progress.stage === "error" && "Error"}
                </Text>
                <TouchableOpacity testID="cancel-upload-button" onPress={cancelUpload}>
                  <Text style={styles.cancelLink}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(8, progress.percent))}%` }]} />
              </View>
              {!!progress.message && <Text style={styles.progressMsg}>{progress.message}</Text>}
            </View>
          )}

          {uploadError && !saving && (
            <View style={styles.errorCard} testID="upload-error-card">
              <Ionicons name="alert-circle" size={18} color={colors.accent} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.errorTitle}>{uploadError.message}</Text>
                {uploadError.detail && (
                  <Text style={styles.errorDetail} numberOfLines={3}>
                    {uploadError.detail}
                  </Text>
                )}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    testID="upload-retry-button"
                    style={styles.retryBtn}
                    onPress={save}
                  >
                    <Ionicons name="refresh" size={14} color={colors.primaryFg} />
                    <Text style={styles.retryBtnText}>Try again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="upload-pick-other-button"
                    style={styles.retryBtnGhost}
                    onPress={() => {
                      setImageUri(null);
                      setUploadError(null);
                    }}
                  >
                    <Text style={styles.retryBtnGhostText}>Choose another photo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            testID="save-item-button"
            style={[styles.saveBtn, (saving || !imageUri) && { opacity: 0.5 }]}
            onPress={save}
            disabled={saving || !imageUri}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryFg} />
            ) : (
              <Text style={styles.saveBtnText}>Save to Closet</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Add Category modal */}
      <Modal visible={showCatModal} transparent animationType="slide" onRequestClose={() => setShowCatModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New category</Text>
            <Text style={styles.modalHelper}>e.g. Vintage Tees, Hiking, Formal Wear.</Text>
            <TextInput
              testID="new-category-input"
              value={newCatName}
              onChangeText={setNewCatName}
              autoFocus
              placeholder="Category name"
              placeholderTextColor={colors.subtle}
              style={styles.modalInput}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <TouchableOpacity
                style={[styles.modalBtnGhost, { flex: 1 }]}
                onPress={() => {
                  setShowCatModal(false);
                  setNewCatName("");
                }}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="save-new-category-button"
                style={[styles.modalBtn, { flex: 1, opacity: addingCat || !newCatName.trim() ? 0.5 : 1 }]}
                onPress={addCustomCategory}
                disabled={addingCat || !newCatName.trim()}
              >
                {addingCat ? (
                  <ActivityIndicator color={colors.primaryFg} />
                ) : (
                  <Text style={styles.modalBtnText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h2 },
  preview: { width: "100%", height: 340, backgroundColor: colors.muted },
  retakeBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  retakeText: { fontSize: 12, fontWeight: "700", color: colors.primary, letterSpacing: 1 },
  captureRow: { flexDirection: "row", gap: spacing.md },
  captureBtn: {
    flex: 1,
    height: 160,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  captureBtnGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  captureText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  sectionLabel: { ...typography.label, marginTop: spacing.xl, marginBottom: spacing.sm },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  chipTextActive: { color: colors.primaryFg },
  chipBadge: { marginLeft: 4, fontSize: 14, color: colors.primary, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: { ...typography.h1, fontSize: 24 },
  modalHelper: { ...typography.body, color: colors.mutedFg, marginTop: 4 },
  modalInput: {
    marginTop: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 12,
    fontSize: 17,
    color: colors.primary,
  },
  modalBtn: { backgroundColor: colors.primary, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  modalBtnGhost: { borderWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: "center" },
  modalBtnGhostText: { color: colors.primary, fontWeight: "700", letterSpacing: 1, fontSize: 12 },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.primary,
  },
  starRow: { flexDirection: "row", gap: spacing.sm },
  star: { padding: 4 },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: spacing.xxl,
  },
  saveBtnText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 13 },
  imageMeta: { fontSize: 11, color: colors.mutedFg, marginTop: 6, paddingHorizontal: 4 },
  progressCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  progressHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4, color: colors.primary },
  cancelLink: { fontSize: 12, fontWeight: "700", color: colors.accent },
  progressBarTrack: { height: 6, backgroundColor: colors.muted, overflow: "hidden", borderRadius: 3 },
  progressBarFill: { height: "100%", backgroundColor: colors.primary },
  progressMsg: { fontSize: 12, color: colors.mutedFg },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FBEDEC",
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 12,
    marginTop: spacing.lg,
  },
  errorTitle: { fontSize: 13.5, fontWeight: "700", color: colors.primary },
  errorDetail: { fontSize: 11, color: colors.mutedFg, marginTop: 4 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryBtnText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 11 },
  retryBtnGhost: {
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryBtnGhostText: { color: colors.primary, fontWeight: "700", letterSpacing: 1, fontSize: 11 },
});
