const __DEBUG__ = true;
const __DEV__ = true;
const StrictMode = 1;
const debug = console.log;
function utfDecodeString(array: Array<number>): string {
  // Avoid spreading the array (e.g. String.fromCodePoint(...array))
  // Functions arguments are first placed on the stack before the function is called
  // which throws a RangeError for large arrays.
  // See github.com/facebook/react/issues/22293
  let string = "";
  for (let i = 0; i < array.length; i++) {
    const char = array[i];
    string += String.fromCodePoint(char);
  }
  return string;
}
const TREE_OPERATION_ADD = 1;
const TREE_OPERATION_REMOVE = 2;
const TREE_OPERATION_REORDER_CHILDREN = 3;
const TREE_OPERATION_UPDATE_TREE_BASE_DURATION = 4;
const TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS = 5;
const TREE_OPERATION_REMOVE_ROOT = 6;
const TREE_OPERATION_SET_SUBTREE_MODE = 7;
const PROFILING_FLAG_BASIC_SUPPORT = 0b01;
const PROFILING_FLAG_TIMELINE_SUPPORT = 0b10;

interface Element {
  id: number;
  parentID: number;
  children: Array<number>;
  type: ElementType;
  displayName: string | null;
  key: number | string | null;

  hocDisplayNames: null | Array<string>;

  // Should the elements children be visible in the tree?
  isCollapsed: boolean;

  // Owner (if available)
  ownerID: number;

  // How many levels deep within the tree is this element?
  // This determines how much indentation (left padding) should be used in the Elements tree.
  depth: number;

  // How many nodes (including itself) are below this Element within the tree.
  // This property is used to quickly determine the total number of Elements,
  // and the Element at any given index (for windowing purposes).
  weight: number;

  // This element is not in a StrictMode compliant subtree.
  // Only true for React versions supporting StrictMode.
  isStrictModeNonCompliant: boolean;
}
const _idToElement: Map<number, Element> = new Map();

const _throwAndEmitError = (e: Error) => {
  throw e;
};

type BridgeProtocol = {
  // Version supported by the current frontend/backend.
  version: number;

  // NPM version range that also supports this version.
  // Note that 'maxNpmVersion' is only set when the version is bumped.
  minNpmVersion: string;
  maxNpmVersion: string | null;
};
const _bridgeProtocol: BridgeProtocol | null = null;

const _rootIDToRendererID: Map<number, number> = new Map();
type Capabilities = {
  supportsBasicProfiling: boolean;
  hasOwnerMetadata: boolean;
  supportsStrictMode: boolean;
  supportsTimeline: boolean;
};
const _rootIDToCapabilities: Map<number, Capabilities> = new Map();
let _roots: Array<number> = [];

type ElementType = 1 | 2 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
const ElementTypeClass = 1;
const ElementTypeContext = 2;
const ElementTypeFunction = 5;
const ElementTypeForwardRef = 6;
const ElementTypeHostComponent = 7;
const ElementTypeMemo = 8;
const ElementTypeOtherOrUnknown = 9;
const ElementTypeProfiler = 10;
const ElementTypeRoot = 11;
const ElementTypeSuspense = 12;
const ElementTypeSuspenseList = 13;
const ElementTypeTracingMarker = 14;
function separateDisplayNameAndHOCs(
  displayName: string | null,
  type: ElementType
): [string | null, Array<string> | null] {
  if (displayName === null) {
    return [null, null];
  }

  let hocDisplayNames = null;

  switch (type) {
    case ElementTypeClass:
    case ElementTypeForwardRef:
    case ElementTypeFunction:
    case ElementTypeMemo:
      if (displayName.indexOf("(") >= 0) {
        const matches = displayName.match(/[^()]+/g);
        if (matches != null) {
          displayName = matches.pop();
          hocDisplayNames = matches;
        }
      }
      break;
    default:
      break;
  }

  return [displayName, hocDisplayNames];
}

const _collapseNodesByDefault = true;
let _weightAcrossRoots: number = 0;

const _adjustParentTreeWeight = (
  parentElement: Element | null,
  weightDelta: number
) => {
  let isInsideCollapsedSubTree = false;

  while (parentElement != null) {
    parentElement.weight += weightDelta;

    // Additions and deletions within a collapsed subtree should not bubble beyond the collapsed parent.
    // Their weight will bubble up when the parent is expanded.
    if (parentElement.isCollapsed) {
      isInsideCollapsedSubTree = true;
      break;
    }

    parentElement = _idToElement.get(parentElement.parentID);
  }

  // Additions and deletions within a collapsed subtree should not affect the overall number of elements.
  if (!isInsideCollapsedSubTree) {
    _weightAcrossRoots += weightDelta;
  }
};

const _ownersMap: Map<number, Set<number>> = new Map();

const _errorsAndWarnings: Map<
  number,
  { errorCount: number; warningCount: number }
> = new Map();

const _recursivelyUpdateSubtree = (
  id: number,
  callback: (element: Element) => void
) => {
  const element = _idToElement.get(id);
  if (element) {
    callback(element);

    element.children.forEach((child) =>
      _recursivelyUpdateSubtree(child, callback)
    );
  }
};

let _revision: number = 0;

type ErrorAndWarningTuples = Array<{ id: number; index: number }>;

let _cachedErrorAndWarningTuples: ErrorAndWarningTuples | null = null;
let _cachedErrorCount: number = 0;
let _cachedWarningCount: number = 0;

let _rootSupportsBasicProfiling: boolean = false;
let _rootSupportsTimelineProfiling: boolean = false;

let _hasOwnerMetadata: boolean = false;

class UnsupportedBridgeOperationError extends Error {
  constructor(message: string) {
    super(message);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnsupportedBridgeOperationError);
    }

    this.name = "UnsupportedBridgeOperationError";
  }
}

export const onBridgeOperations = (operations: Array<number>) => {
  if (__DEBUG__) {
    console.groupCollapsed("onBridgeOperations");
    debug("onBridgeOperations", operations.join(","));
  }

  let haveRootsChanged = false;
  let haveErrorsOrWarningsChanged = false;

  // The first two values are always rendererID and rootID
  const rendererID = operations[0];

  const addedElementIDs: Array<number> = [];
  // This is a mapping of removed ID -> parent ID:
  const removedElementIDs: Map<number, number> = new Map();
  // We'll use the parent ID to adjust selection if it gets deleted.

  let i = 2;

  // Reassemble the string table.
  const stringTable: Array<null | string> = [
    null, // ID = 0 corresponds to the null string.
  ];
  const stringTableSize = operations[i++];
  const stringTableEnd = i + stringTableSize;
  while (i < stringTableEnd) {
    const nextLength = operations[i++];
    const nextString = utfDecodeString(operations.slice(i, i + nextLength));
    stringTable.push(nextString);
    i += nextLength;
  }

  while (i < operations.length) {
    const operation = operations[i];
    switch (operation) {
      case TREE_OPERATION_ADD: {
        const id = operations[i + 1];
        const type = operations[i + 2] as ElementType;

        i += 3;

        if (_idToElement.has(id)) {
          _throwAndEmitError(
            Error(
              `Cannot add node "${id}" because a node with that id is already in the Store.`
            )
          );
        }

        let ownerID: number = 0;
        let parentID: number = 0;
        if (type === ElementTypeRoot) {
          if (__DEBUG__) {
            debug("Add", `new root node ${id}`);
          }

          const isStrictModeCompliant = operations[i] > 0;
          i++;

          const supportsBasicProfiling =
            (operations[i] & PROFILING_FLAG_BASIC_SUPPORT) !== 0;
          const supportsTimeline =
            (operations[i] & PROFILING_FLAG_TIMELINE_SUPPORT) !== 0;
          i++;

          let supportsStrictMode = false;
          let hasOwnerMetadata = false;

          // If we don't know the bridge protocol, guess that we're dealing with the latest.
          // If we do know it, we can take it into consideration when parsing operations.
          if (_bridgeProtocol === null || _bridgeProtocol.version >= 2) {
            supportsStrictMode = operations[i] > 0;
            i++;

            hasOwnerMetadata = operations[i] > 0;
            i++;
          }

          _roots = _roots.concat(id);
          _rootIDToRendererID.set(id, rendererID);
          _rootIDToCapabilities.set(id, {
            supportsBasicProfiling,
            hasOwnerMetadata,
            supportsStrictMode,
            supportsTimeline,
          });

          // Not all roots support StrictMode;
          // don't flag a root as non-compliant unless it also supports StrictMode.
          const isStrictModeNonCompliant =
            !isStrictModeCompliant && supportsStrictMode;

          _idToElement.set(id, {
            children: [],
            depth: -1,
            displayName: null,
            hocDisplayNames: null,
            id,
            isCollapsed: false, // Never collapse roots; it would hide the entire tree.
            isStrictModeNonCompliant,
            key: null,
            ownerID: 0,
            parentID: 0,
            type,
            weight: 0,
          });

          haveRootsChanged = true;
        } else {
          parentID = operations[i];
          i++;

          ownerID = operations[i];
          i++;

          const displayNameStringID = operations[i];
          const displayName = stringTable[displayNameStringID];
          i++;

          const keyStringID = operations[i];
          const key = stringTable[keyStringID];
          i++;

          if (__DEBUG__) {
            debug(
              "Add",
              `node ${id} (${displayName || "null"}) as child of ${parentID}`
            );
          }

          if (!_idToElement.has(parentID)) {
            _throwAndEmitError(
              Error(
                `Cannot add child "${id}" to parent "${parentID}" because parent node was not found in the Store.`
              )
            );
          }

          const parentElement = _idToElement.get(parentID);
          parentElement.children.push(id);

          const [displayNameWithoutHOCs, hocDisplayNames] =
            separateDisplayNameAndHOCs(displayName, type);

          const element: Element = {
            children: [],
            depth: parentElement.depth + 1,
            displayName: displayNameWithoutHOCs,
            hocDisplayNames,
            id,
            isCollapsed: _collapseNodesByDefault,
            isStrictModeNonCompliant: parentElement.isStrictModeNonCompliant,
            key,
            ownerID,
            parentID,
            type,
            weight: 1,
          };

          _idToElement.set(id, element);
          addedElementIDs.push(id);
          _adjustParentTreeWeight(parentElement, 1);

          if (ownerID > 0) {
            let set = _ownersMap.get(ownerID);
            if (set === undefined) {
              set = new Set();
              _ownersMap.set(ownerID, set);
            }
            set.add(id);
          }
        }
        break;
      }
      case TREE_OPERATION_REMOVE: {
        const removeLength = operations[i + 1];
        i += 2;

        for (let removeIndex = 0; removeIndex < removeLength; removeIndex++) {
          const id = operations[i];

          if (!_idToElement.has(id)) {
            _throwAndEmitError(
              Error(
                `Cannot remove node "${id}" because no matching node was found in the Store.`
              )
            );
          }

          i += 1;

          const element = _idToElement.get(id);
          const { children, ownerID, parentID, weight } = element;
          if (children.length > 0) {
            _throwAndEmitError(
              Error(`Node "${id}" was removed before its children.`)
            );
          }

          _idToElement.delete(id);

          let parentElement = null;
          if (parentID === 0) {
            if (__DEBUG__) {
              debug("Remove", `node ${id} root`);
            }

            _roots = _roots.filter((rootID) => rootID !== id);
            _rootIDToRendererID.delete(id);
            _rootIDToCapabilities.delete(id);

            haveRootsChanged = true;
          } else {
            if (__DEBUG__) {
              debug("Remove", `node ${id} from parent ${parentID}`);
            }
            parentElement = _idToElement.get(parentID);
            if (parentElement === undefined) {
              _throwAndEmitError(
                Error(
                  `Cannot remove node "${id}" from parent "${parentID}" because no matching node was found in the Store.`
                )
              );
            }
            const index = parentElement.children.indexOf(id);
            parentElement.children.splice(index, 1);
          }

          _adjustParentTreeWeight(parentElement, -weight);
          removedElementIDs.set(id, parentID);

          _ownersMap.delete(id);
          if (ownerID > 0) {
            const set = _ownersMap.get(ownerID);
            if (set !== undefined) {
              set.delete(id);
            }
          }

          if (_errorsAndWarnings.has(id)) {
            _errorsAndWarnings.delete(id);
            haveErrorsOrWarningsChanged = true;
          }
        }

        break;
      }
      case TREE_OPERATION_REMOVE_ROOT: {
        i += 1;

        const id = operations[1];

        if (__DEBUG__) {
          debug(`Remove root ${id}`);
        }

        const recursivelyDeleteElements = (elementID) => {
          const element = _idToElement.get(elementID);
          _idToElement.delete(elementID);
          if (element) {
            // Mostly for Flow's sake
            for (let index = 0; index < element.children.length; index++) {
              recursivelyDeleteElements(element.children[index]);
            }
          }
        };

        const root = _idToElement.get(id);
        recursivelyDeleteElements(id);

        _rootIDToCapabilities.delete(id);
        _rootIDToRendererID.delete(id);
        _roots = _roots.filter((rootID) => rootID !== id);
        _weightAcrossRoots -= root.weight;
        break;
      }
      case TREE_OPERATION_REORDER_CHILDREN: {
        const id = operations[i + 1];
        const numChildren = operations[i + 2];
        i += 3;

        if (!_idToElement.has(id)) {
          _throwAndEmitError(
            Error(
              `Cannot reorder children for node "${id}" because no matching node was found in the Store.`
            )
          );
        }

        const element = _idToElement.get(id);
        const children = element.children;
        if (children.length !== numChildren) {
          _throwAndEmitError(
            Error(
              `Children cannot be added or removed during a reorder operation.`
            )
          );
        }

        for (let j = 0; j < numChildren; j++) {
          const childID = operations[i + j];
          children[j] = childID;
          if (__DEV__) {
            // This check is more expensive so it's gated by __DEV__.
            const childElement = _idToElement.get(childID);
            if (childElement == null || childElement.parentID !== id) {
              console.error(
                `Children cannot be added or removed during a reorder operation.`
              );
            }
          }
        }
        i += numChildren;

        if (__DEBUG__) {
          debug("Re-order", `Node ${id} children ${children.join(",")}`);
        }
        break;
      }
      case TREE_OPERATION_SET_SUBTREE_MODE: {
        const id = operations[i + 1];
        const mode = operations[i + 2];

        i += 3;

        // If elements have already been mounted in this subtree, update them.
        // (In practice, this likely only applies to the root element.)
        if (mode === StrictMode) {
          _recursivelyUpdateSubtree(id, (element) => {
            element.isStrictModeNonCompliant = false;
          });
        }

        if (__DEBUG__) {
          debug("Subtree mode", `Subtree with root ${id} set to mode ${mode}`);
        }
        break;
      }
      case TREE_OPERATION_UPDATE_TREE_BASE_DURATION:
        // Base duration updates are only sent while profiling is in progress.
        // We can ignore them at this point.
        // The profiler UI uses them lazily in order to generate the tree.
        i += 3;
        break;
      case TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS:
        const id = operations[i + 1];
        const errorCount = operations[i + 2];
        const warningCount = operations[i + 3];

        i += 4;

        if (errorCount > 0 || warningCount > 0) {
          _errorsAndWarnings.set(id, { errorCount, warningCount });
        } else if (_errorsAndWarnings.has(id)) {
          _errorsAndWarnings.delete(id);
        }
        haveErrorsOrWarningsChanged = true;
        break;
      default:
        _throwAndEmitError(
          new UnsupportedBridgeOperationError(
            `Unsupported Bridge operation "${operation}"`
          )
        );
    }
  }

  _revision++;

  // Any time the tree changes (e.g. elements added, removed, or reordered) cached inidices may be invalid.
  _cachedErrorAndWarningTuples = null;

  if (haveErrorsOrWarningsChanged) {
    let errorCount = 0;
    let warningCount = 0;

    _errorsAndWarnings.forEach((entry) => {
      errorCount += entry.errorCount;
      warningCount += entry.warningCount;
    });

    _cachedErrorCount = errorCount;
    _cachedWarningCount = warningCount;
  }

  if (haveRootsChanged) {
    const prevRootSupportsProfiling = _rootSupportsBasicProfiling;
    const prevRootSupportsTimelineProfiling = _rootSupportsTimelineProfiling;

    _hasOwnerMetadata = false;
    _rootSupportsBasicProfiling = false;
    _rootSupportsTimelineProfiling = false;
    _rootIDToCapabilities.forEach(
      ({ supportsBasicProfiling, hasOwnerMetadata, supportsTimeline }) => {
        if (supportsBasicProfiling) {
          _rootSupportsBasicProfiling = true;
        }
        if (hasOwnerMetadata) {
          _hasOwnerMetadata = true;
        }
        if (supportsTimeline) {
          _rootSupportsTimelineProfiling = true;
        }
      }
    );

    // this.emit("roots");

    if (_rootSupportsBasicProfiling !== prevRootSupportsProfiling) {
      // this.emit("rootSupportsBasicProfiling");
    }

    if (_rootSupportsTimelineProfiling !== prevRootSupportsTimelineProfiling) {
      // this.emit("rootSupportsTimelineProfiling");
    }
  }

  if (__DEBUG__) {
    // TODO https://github.com/facebook/react/blob/2e1c8841e97923e7af50c5c5311e3724b7b6555d/packages/react-devtools-shared/src/devtools/utils.js#L53
    // console.log(printStore(this, true));
    console.log(_idToElement);
    console.groupEnd();
  }

  // this.emit("mutated", [addedElementIDs, removedElementIDs]);
};
