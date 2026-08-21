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
}

export const TRY_ON_MODELS: TryOnModel[] = [
  {
    id: 'aarav',
    label: 'Aarav',
    note: 'Turned three-quarters. Good for a single earring and for judging a profile.',
    photo: '/models/aarav.png',
  },
  {
    id: 'mira',
    label: 'Mira',
    note: 'Bare neck and collarbone, hair up. The one to use for pendants and chains.',
    photo: '/models/mira.png',
  },
  {
    id: 'yours',
    label: 'Your own face',
    note: 'Add a photo or take a selfie. It is read in this tab and never uploaded.',
    photo: null,
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
