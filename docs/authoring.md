# Writing a reading edition

Palim gives the authoring agent a set of tools, not a prescribed book template. Choose the explanation and visual that help this reader answer their question. Use a consistent, quiet text style and let the reader adjust it.

## Ways to explain

| Reader needs to understand          | Possible treatment                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| What happens, in order              | Numbered steps, a timeline, or a small sequence diagram.                                |
| How parts fit together              | An annotated photograph, cutaway, or simple labelled diagram.                           |
| How one choice differs from another | A short comparison, two images with the same viewpoint, or a narrow table.              |
| Where something is                  | A map with a plain-language description of the location and scale.                      |
| Why an outcome changed              | A worked example with the inputs, calculation and result.                               |
| What the numbers show               | A labelled chart with units, source and the relevant values in text.                    |
| How code behaves                    | A short excerpt followed by a concrete input and output.                                |
| What to do next                     | A checklist when actions need checking; a notice when a real condition needs attention. |
| What is known                       | Separate observed evidence, interpretation and uncertainty; link the original sources.  |

These are options, not requirements. A single useful illustration may be better than several decorative ones. Avoid implying that generated or reconstructed images are photographs or evidence of an event. Check the right to use, adapt and credit any material before including it.

## One example

A wide schedule can be useful at a glance but its labels may shrink on a phone. Place its essential details in ordinary text as well:

```markdown
The work has three stages:

1. Collect the source material.
2. Review the evidence and draft the explanation.
3. Complete the final review.

![A three-stage schedule](figure:schedule)
```

The figure's `alt` should identify the schedule and point to the nearby description. Its `caption` can name the context or source. Include dates, durations and dependencies in the text if they matter; the three sentences above do not describe a real schedule. For complex figures, see the W3C's [guidance on text alternatives](https://www.w3.org/WAI/tutorials/images/complex/).

## Preparing figures

Use an owned PNG/JPEG for a photograph, map, annotated illustration or other artwork. A connected agent can call `import_image` with a client-provided file, then use the returned `artifactId` as the figure's `assetId`. If the client cannot provide the file object, upload it in the signed-in workspace and give the temporary asset ID to the agent. Do not invent a file URL or paste image bytes into the manuscript.

Use Mermaid for a small relationship or sequence, and the built-in bar chart for supplied numeric data. Palim also accepts ordinary Markdown headings, lists, blockquotes, code and tables. Raw HTML and remote images are not supported. Define each figure once, give it `alt` and `caption`, and put each `figure:id` reference on its own line. Add the full useful explanation beside a complex figure rather than hiding it only inside the image.

Images are private temporary uploads: each is at most 20 MiB and four million pixels, with at most 8 MiB of distinct images per book. They count toward the shared upload allowance and expire after 24 hours. There are at most 12 figures per book. Inspect the preview and warnings, and check legibility, reading order and text alternatives in the intended reading app. A browser preview does not prove EPUB accessibility or Kindle behavior; [EPUB Accessibility 1.1](https://www.w3.org/TR/epub-a11y-11/) sets out the broader requirements.

Palim creates reflowable EPUB, not a fixed-layout PDF. Large foldouts, complex multi-column pages and print-specific placement need a separate publishing workflow; do not force them into an EPUB image and assume the result is readable.

The [NASA handbook skill](https://github.com/R44VC0RP/skills/tree/main/skills/nasa-handbook) was studied for ideas about explaining technical material. Palim does not include its files, fonts or code. GitHub's repository metadata did not identify a repository license when checked; reuse would need a separate rights check.
