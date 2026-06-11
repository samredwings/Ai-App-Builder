import { useState, useCallback } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface IconUploaderProps {
  onSave: (blob: Blob) => void;
  saving?: boolean;
}

async function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (err) => reject(err));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas blob failed"))),
      "image/png",
      0.92
    );
  });
}

export function IconUploader({ onSave, saving }: IconUploaderProps) {
  const [image, setImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = async () => {
    if (!image || !croppedAreaPixels) return;
    const blob = await getCroppedBlob(image, croppedAreaPixels);
    onSave(blob);
  };

  return (
    <div className="space-y-4">
      {!image ? (
        <div className="space-y-2">
          <Label>Upload icon image</Label>
          <Input type="file" onChange={onFileChange} accept="image/*" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative h-64 w-full overflow-hidden rounded-lg bg-muted">
            <Cropper
              image={image}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Zoom</Label>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.1}
              onValueChange={(v) => setZoom(v[0])}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <PreviewStyle image={image} label="iOS" className="rounded-[22%]" />
            <PreviewStyle image={image} label="Android" className="rounded-full" />
            <PreviewStyle image={image} label="Web" className="rounded-md" />
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setImage(null);
                setZoom(1);
                setCrop({ x: 0, y: 0 });
                setCroppedAreaPixels(null);
              }}
            >
              Choose different
            </Button>
            <Button
              className="flex-1"
              disabled={saving || !croppedAreaPixels}
              onClick={handleSave}
            >
              {saving ? "Saving…" : "Save icon"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewStyle({
  image,
  label,
  className,
}: {
  image: string;
  label: string;
  className: string;
}) {
  return (
    <div className="text-center">
      <div
        className={`h-16 w-16 mx-auto bg-cover bg-center ${className}`}
        style={{ backgroundImage: `url(${image})` }}
      />
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
