// The people you can try a piece on before you upload anything.
//
// These are ordinary photographs, not rigged assets and not baked overlays. Each one goes
// down the same road a photo of you does: FaceMesh finds 468 landmarks, facemesh.ts turns
// them into a metric mesh, and the piece hangs off that. So there are no hand-placed
// anchor points to drift out of date, and "a model" and "you" are the same code path -
// if it works for one it works for the other.

export interface TryOnModel {
  id: string;
  label: string;
  note: string;
  photo: string | null;
  /**
   * Which part of a person the photograph is of, and therefore which model reads it.
   *
   * A face and a hand are two different landmarkers, two different sets of anchors and
   * two different renderers. Saying so on the subject is what stops a ring being placed
   * on an earlobe, which is exactly what happened while every subject was assumed to be
   * a face.
   */
  subject: 'face' | 'hand';
}

export const TRY_ON_MODELS: TryOnModel[] = [
  {
    id: 'aarav',
    label: 'Aarav',
    note: 'Turned three-quarters. Good for a single earring and for judging a profile.',
    photo: '/models/aarav.png',
    subject: 'face',
  },
  {
    id: 'mira',
    label: 'Mira',
    note: 'Bare neck and collarbone, hair up. The one to use for pendants and chains.',
    photo: '/models/mira.png',
    subject: 'face',
  },
  {
    id: 'yours',
    label: 'Your own face',
    note: 'Add a photo or take a selfie. It is read in this tab and never uploaded.',
    photo: null,
    subject: 'face',
  },
  {
    id: 'hand',
    label: 'A hand',
    note:
      'Add a photo of a hand, or snap one from the camera. Rings go on the ring finger, ' +
      'sized from the span across the knuckles. Nothing is uploaded.',
    // Deliberately not a stock photograph. Aarav and Mira are portraits, and there is no
    // hand photo this project has the right to ship - so the hand is always the person's
    // own, either from a file or grabbed from the live camera.
    photo: null,
    subject: 'hand',
  },
];

/**
 * Fetches a built-in model photo as a File, so it is indistinguishable downstream from one
 * dropped on the page. Same decode, same detection, same failure modes.
 */
export async function loadModelPhoto(id: string): Promise<File> {
  const model = TRY_ON_MODELS.find((entry) => entry.id === id);
  if (!model?.photo) throw new Error(`"${id}" is not a photographed model`);

  const response = await fetch(model.photo);
  if (!response.ok) throw new Error(`${model.photo} returned ${response.status}`);

  const blob = await response.blob();
  return new File([blob], `${id}.png`, { type: blob.type || 'image/png' });
}
