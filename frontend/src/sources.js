/* "Sources": citations for the datasets and pretrained models Surg+F is built on (tools and libraries are
   linked in the sections above). Shown right before the footer on every version of the homepage. Paper metadata was checked against
   arXiv and the publishers on 2026-11-15.

   CholecT50: the Hugging Face card (Voxel51/cholect50) asks for "Rendition of CholecT50 ... arXiv:2202.05324",
   but that arXiv ID is an unrelated paper and no such title exists there. The dataset's authors ask for the
   Rendezvous paper instead (github.com/CAMMA-public/cholect50, "Research Papers"), so that is cited here. */

const a = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const GROUPS = [
  {
    id: 'data', title: 'Datasets',
    use: 'The surgery videos and surgeon labels behind search and training, the boxes behind the detector, and the anatomy behind the 3D view.',
    items: [
      {
        cite: 'C. I. Nwoye, T. Yu, C. Gonzalez, B. Seeliger, P. Mascagni, D. Mutter, J. Marescaux, N. Padoy. <b>Rendezvous: Attention mechanisms for the recognition of surgical action triplets in endoscopic videos.</b> <i>Medical Image Analysis</i> 78 (2022) 102433.',
        role: 'CholecT50: 50 laparoscopic gallbladder removals with instrument, action and target labels for every second. The citation the dataset’s authors ask for.',
        links: [['https://doi.org/10.1016/j.media.2022.102433', 'Paper'], ['https://arxiv.org/abs/2109.03223', 'arXiv'], ['https://github.com/CAMMA-public/cholect50', 'Dataset']],
        license: ['CC BY-NC-SA 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0/'],
        bib: `@article{nwoye2022rendezvous,
  title={Rendezvous: Attention mechanisms for the recognition of surgical action triplets in endoscopic videos},
  author={Nwoye, Chinedu Innocent and Yu, Tong and Gonzalez, Cristians and Seeliger, Barbara and Mascagni, Pietro and Mutter, Didier and Marescaux, Jacques and Padoy, Nicolas},
  journal={Medical Image Analysis},
  volume={78},
  pages={102433},
  year={2022},
  doi={10.1016/j.media.2022.102433}
}`,
      },
      {
        cite: 'A. P. Twinanda, S. Shehata, D. Mutter, J. Marescaux, M. de Mathelin, N. Padoy. <b>EndoNet: A deep architecture for recognition tasks on laparoscopic videos.</b> <i>IEEE Transactions on Medical Imaging</i> 36(1) (2017) 86–97.',
        role: 'Cholec80: the 25 fps VID01 and VID02 videos and their step (phase) labels.',
        links: [['https://doi.org/10.1109/TMI.2016.2593957', 'Paper'], ['https://arxiv.org/abs/1602.03012', 'arXiv'], ['https://camma.unistra.fr/datasets/', 'Dataset']],
        license: ['CC BY-NC-SA 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0/'],
        bib: `@article{twinanda2017endonet,
  title={EndoNet: A deep architecture for recognition tasks on laparoscopic videos},
  author={Twinanda, Andru P. and Shehata, Sherif and Mutter, Didier and Marescaux, Jacques and de Mathelin, Michel and Padoy, Nicolas},
  journal={IEEE Transactions on Medical Imaging},
  volume={36},
  number={1},
  pages={86--97},
  year={2017},
  doi={10.1109/TMI.2016.2593957}
}`,
      },
      {
        cite: 'A. Murali, D. Alapatt, P. Mascagni, A. Vardazaryan, A. Garcia, N. Okamoto, G. Costamagna, D. Mutter, et al. <b>The Endoscapes dataset for surgical scene segmentation, object detection, and critical view of safety assessment: Official splits and benchmark.</b> <i>Scientific Data</i> 12 (2025) 331.',
        role: 'Endoscapes: the surgeon-boxed frames the detector was fine-tuned on.',
        links: [['https://doi.org/10.1038/s41597-025-04642-4', 'Paper'], ['https://arxiv.org/abs/2312.12429', 'arXiv'], ['https://github.com/CAMMA-public/Endoscapes', 'Dataset']],
        license: ['CC BY-NC-SA 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0/'],
        bib: `@article{murali2025endoscapes,
  title={The Endoscapes dataset for surgical scene segmentation, object detection, and critical view of safety assessment: Official splits and benchmark},
  author={Murali, Aditya and Alapatt, Deepak and Mascagni, Pietro and Vardazaryan, Armine and Garcia, Alain and Okamoto, Nariaki and Costamagna, Guido and Mutter, Didier and others},
  journal={Scientific Data},
  volume={12},
  pages={331},
  year={2025},
  doi={10.1038/s41597-025-04642-4}
}`,
      },
      {
        cite: 'N. Mitsuhashi, K. Fujieda, T. Tamura, S. Kawamoto, T. Takagi, K. Okubo. <b>BodyParts3D: 3D structure database for anatomical concepts.</b> <i>Nucleic Acids Research</i> 37 (2009) D782–D785.',
        role: 'BodyParts3D, © The Database Center for Life Science: the anatomy in the 3D view. We selected 11 structures and simplified them; clips, cut and triangle are our own drawings.',
        links: [['https://doi.org/10.1093/nar/gkn613', 'Paper'], ['https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html', 'Database']],
        license: ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
        bib: `@article{mitsuhashi2009bodyparts3d,
  title={BodyParts3D: 3D structure database for anatomical concepts},
  author={Mitsuhashi, Nobutaka and Fujieda, Kaori and Tamura, Takuro and Kawamoto, Shoko and Takagi, Toshihisa and Okubo, Kousaku},
  journal={Nucleic Acids Research},
  volume={37},
  number={suppl\\_1},
  pages={D782--D785},
  year={2009},
  doi={10.1093/nar/gkn613}
}`,
      },
    ],
  },
  {
    id: 'models', title: 'Pretrained models',
    use: 'Models trained by others that Surg+F builds on.',
    items: [
      {
        cite: 'K. Yuan, V. Srivastav, T. Yu, J. L. Lavanchy, J. Marescaux, P. Mascagni, N. Navab, N. Padoy. <b>Learning multi-modal representations by watching hundreds of surgical video lectures.</b> <i>Medical Image Analysis</i> (2025). arXiv:2307.15220.',
        role: 'SurgVLP, used frozen: its ResNet-50 image branch turns each second of video into 768 numbers for the label model.',
        links: [['https://arxiv.org/abs/2307.15220', 'arXiv'], ['https://github.com/CAMMA-public/SurgVLP', 'Code']],
        bib: `@article{yuan2023learning,
  title={Learning multi-modal representations by watching hundreds of surgical video lectures},
  author={Yuan, Kun and Srivastav, Vinkle and Yu, Tong and Lavanchy, Joel L. and Marescaux, Jacques and Mascagni, Pietro and Navab, Nassir and Padoy, Nicolas},
  journal={arXiv preprint arXiv:2307.15220},
  year={2023}
}`,
      },
      {
        cite: 'S. Ren, K. He, R. Girshick, J. Sun. <b>Faster R-CNN: Towards real-time object detection with region proposal networks.</b> <i>NeurIPS</i> (2015).',
        role: 'The detector, starting from torchvision’s COCO-pretrained Faster R-CNN (MobileNetV3 backbone) and fine-tuned on Endoscapes to draw boxes on the video.',
        links: [['https://arxiv.org/abs/1506.01497', 'arXiv'], ['https://docs.pytorch.org/vision/stable/models/faster_rcnn.html', 'Weights']],
        bib: `@inproceedings{ren2015faster,
  title={Faster R-CNN: Towards real-time object detection with region proposal networks},
  author={Ren, Shaoqing and He, Kaiming and Girshick, Ross and Sun, Jian},
  booktitle={Advances in Neural Information Processing Systems (NeurIPS)},
  year={2015}
}`,
      },
      {
        cite: 'A. Grattafiori et al. <b>The Llama 3 herd of models.</b> arXiv:2407.21783 (2024).',
        role: 'Llama 3.3 70B, served by Databricks Foundation Model APIs, routes each chat message to a tool.',
        links: [['https://arxiv.org/abs/2407.21783', 'arXiv']],
        bib: `@article{grattafiori2024llama,
  title={The Llama 3 herd of models},
  author={Grattafiori, Aaron and others},
  journal={arXiv preprint arXiv:2407.21783},
  year={2024}
}`,
      },
    ],
  },
];

const item = (it, k) => `<li class="src-item" style="--k:${k}">
  <p class="src-cite">${it.cite}</p>
  <p class="src-role">${it.role}</p>
  <div class="src-meta">${it.links.map(([h, t]) => a(h, t)).join('')}${it.license ? `<span class="src-license">${a(it.license[1], it.license[0])}</span>` : ''}</div>
  ${it.bib ? `<details class="src-bib"><summary>BibTeX</summary><pre>${esc(it.bib)}</pre></details>` : ''}
</li>`;

export function sourcesSection() {
  return `<section class="sources" id="sources" aria-labelledby="sources-heading">
    <div class="src-head"><h2 id="sources-heading">Sources.</h2><p>The datasets and pretrained models Surg+F is built on.</p></div>
    <div class="src-groups">${GROUPS.map((g, gi) => `<section class="src-group" id="sources-${g.id}" aria-labelledby="sources-${g.id}-title" style="--in:0;--g:${gi}">
      <div class="src-group-head"><span class="src-num">${String(gi + 1).padStart(2, '0')}</span><div><h3 id="sources-${g.id}-title">${g.title}</h3><p>${g.use}</p></div></div>
      <ol class="src-list">${g.items.map(item).join('')}</ol>
    </section>`).join('')}</div>
  </section>`;
}

/* Reveal: each group slides in as it enters the view; its rows follow one after another. */
export function updateSources(root, reduced) {
  const vh = window.innerHeight;
  root.querySelectorAll('.src-group').forEach(g => {
    const top = g.getBoundingClientRect().top;
    const v = reduced ? 1 : Math.max(0, Math.min(1, (vh * .92 - top) / (vh * .55)));
    g.style.setProperty('--in', v.toFixed(3));
  });
}
