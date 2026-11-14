"""Check a saved search response against a known clip."""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("response", type=Path)
    parser.add_argument("--case", required=True)
    parser.add_argument("--second", required=True, type=float)
    parser.add_argument("--source", choices=("fixture", "annotation", "prediction"),
                        default="annotation")
    args = parser.parse_args()
    results = json.loads(args.response.read_text())["results"]
    for hit in results[:3]:
        if (hit["case_id"] == args.case and hit["source"] == args.source
                and hit["start_sec"] <= args.second < hit["end_sec"]):
            print("Expected clip found in the top three results.")
            return
    parser.exit(1, "Expected clip missing from the top three results.\n")


if __name__ == "__main__":
    main()
