"""Plot actual detector boxes over source frames for offline inspection."""
import argparse
import hashlib
import json
from pathlib import Path
from artifact import validate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('artifact')
    parser.add_argument('--frames-dir', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    output = Path(args.output)
    if output.exists():
        raise FileExistsError(output)
    data = validate(json.loads(Path(args.artifact).read_text()))
    if not 1 <= len(data['frames']) <= 12:
        raise ValueError('preview requires 1-12 frames')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    from PIL import Image
    fig, axes = plt.subplots(len(data['frames']), 1, figsize=(12, 7 * len(data['frames'])), squeeze=False)
    for ax, frame in zip(axes[:, 0], data['frames']):
        name = f"{frame['frame_id']:06d}.png"
        path = Path(args.frames_dir) / name
        expected = data['provenance'].get('source_image_sha256', {}).get(name)
        if not expected or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f'source image hash mismatch or missing: {name}')
        image = Image.open(path)
        if image.size != (data['image_width'], data['image_height']):
            raise ValueError('source dimensions mismatch')
        ax.imshow(image)
        width, height = image.size
        for d in frame['detections']:
            x1,y1,x2,y2 = d['bbox_xyxy']
            color = '#ac92ff' if d['category'] == 'instrument' else '#5ee0bd'
            ax.add_patch(Rectangle((x1*width,y1*height),(x2-x1)*width,(y2-y1)*height,fill=False,edgecolor=color,linewidth=2))
            ax.text(x1*width,y1*height,f"{d['label']} | score {d['score']:.2f}",color='white',fontsize=10,va='top',bbox=dict(facecolor='#272138',alpha=.85,edgecolor=color))
        ax.set_title(f"{data['case_id']} | frame {frame['frame_id']} | {frame['timestamp_sec']:.2f}s | {data['source']}")
        ax.axis('off')
    fig.suptitle('Actual model output — experimental, incorrect labels remain\nOffline plot, not a browser screenshot or reviewed annotation', fontsize=15)
    fig.text(.5,.005,'Source: CholecT50 / Cholec80 (CAMMA), CC BY-NC-SA 4.0. Detector: IDEA-Research Grounding DINO.',ha='center',fontsize=9)
    fig.tight_layout(rect=(0,.02,1,.96))
    output.parent.mkdir(parents=True,exist_ok=True)
    fig.savefig(output,dpi=120)
    plt.close(fig)
    print(output)


if __name__ == '__main__':
    main()
