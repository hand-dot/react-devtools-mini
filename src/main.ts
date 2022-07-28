const __DEBUG__ = true;
const debug = console.log

export const onBridgeOperations = (operations: Array<number>) => {
  if (__DEBUG__) {
    console.groupCollapsed('onBridgeOperations');
    debug('onBridgeOperations', operations.join(','));
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
  const stringTable = [
    null, // ID = 0 corresponds to the null string.
  ];
  const stringTableSize = operations[i++];
  const stringTableEnd = i + stringTableSize;
  while (i < stringTableEnd) {
    const nextLength = operations[i++];
    const nextString = utfDecodeString(
      (operations.slice(i, i + nextLength): any),
    );
    stringTable.push(nextString);
    i += nextLength;
  }

  while (i < operations.length) {
    const operation = operations[i];
    switch (operation) {
      case TREE_OPERATION_ADD: {
        const id = ((operations[i + 1]: any): number);
        const type = ((operations[i + 2]: any): ElementType);

        i += 3;

        if (this._idToElement.has(id)) {
          this._throwAndEmitError(
            Error(
              `Cannot add node "${id}" because a node with that id is already in the Store.`,
            ),
          );
        }

        let ownerID: number = 0;
        let parentID: number = ((null: any): number);
        if (type === ElementTypeRoot) {
          if (__DEBUG__) {
            debug('Add', `new root node ${id}`);
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
          if (
            this._bridgeProtocol === null ||
            this._bridgeProtocol.version >= 2
          ) {
            supportsStrictMode = operations[i] > 0;
            i++;

            hasOwnerMetadata = operations[i] > 0;
            i++;
          }

          this._roots = this._roots.concat(id);
          this._rootIDToRendererID.set(id, rendererID);
          this._rootIDToCapabilities.set(id, {
            supportsBasicProfiling,
            hasOwnerMetadata,
            supportsStrictMode,
            supportsTimeline,
          });

          // Not all roots support StrictMode;
          // don't flag a root as non-compliant unless it also supports StrictMode.
          const isStrictModeNonCompliant =
            !isStrictModeCompliant && supportsStrictMode;

          this._idToElement.set(id, {
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
          parentID = ((operations[i]: any): number);
          i++;

          ownerID = ((operations[i]: any): number);
          i++;

          const displayNameStringID = operations[i];
          const displayName = stringTable[displayNameStringID];
          i++;

          const keyStringID = operations[i];
          const key = stringTable[keyStringID];
          i++;

          if (__DEBUG__) {
            debug(
              'Add',
              `node ${id} (${displayName || 'null'}) as child of ${parentID}`,
            );
          }

          if (!this._idToElement.has(parentID)) {
            this._throwAndEmitError(
              Error(
                `Cannot add child "${id}" to parent "${parentID}" because parent node was not found in the Store.`,
              ),
            );
          }

          const parentElement = ((this._idToElement.get(
            parentID,
          ): any): Element);
          parentElement.children.push(id);

          const [
            displayNameWithoutHOCs,
            hocDisplayNames,
          ] = separateDisplayNameAndHOCs(displayName, type);

          const element: Element = {
            children: [],
            depth: parentElement.depth + 1,
            displayName: displayNameWithoutHOCs,
            hocDisplayNames,
            id,
            isCollapsed: this._collapseNodesByDefault,
            isStrictModeNonCompliant: parentElement.isStrictModeNonCompliant,
            key,
            ownerID,
            parentID,
            type,
            weight: 1,
          };

          this._idToElement.set(id, element);
          addedElementIDs.push(id);
          this._adjustParentTreeWeight(parentElement, 1);

          if (ownerID > 0) {
            let set = this._ownersMap.get(ownerID);
            if (set === undefined) {
              set = new Set();
              this._ownersMap.set(ownerID, set);
            }
            set.add(id);
          }
        }
        break;
      }
      case TREE_OPERATION_REMOVE: {
        const removeLength = ((operations[i + 1]: any): number);
        i += 2;

        for (let removeIndex = 0; removeIndex < removeLength; removeIndex++) {
          const id = ((operations[i]: any): number);

          if (!this._idToElement.has(id)) {
            this._throwAndEmitError(
              Error(
                `Cannot remove node "${id}" because no matching node was found in the Store.`,
              ),
            );
          }

          i += 1;

          const element = ((this._idToElement.get(id): any): Element);
          const {children, ownerID, parentID, weight} = element;
          if (children.length > 0) {
            this._throwAndEmitError(
              Error(`Node "${id}" was removed before its children.`),
            );
          }

          this._idToElement.delete(id);

          let parentElement = null;
          if (parentID === 0) {
            if (__DEBUG__) {
              debug('Remove', `node ${id} root`);
            }

            this._roots = this._roots.filter(rootID => rootID !== id);
            this._rootIDToRendererID.delete(id);
            this._rootIDToCapabilities.delete(id);

            haveRootsChanged = true;
          } else {
            if (__DEBUG__) {
              debug('Remove', `node ${id} from parent ${parentID}`);
            }
            parentElement = ((this._idToElement.get(parentID): any): Element);
            if (parentElement === undefined) {
              this._throwAndEmitError(
                Error(
                  `Cannot remove node "${id}" from parent "${parentID}" because no matching node was found in the Store.`,
                ),
              );
            }
            const index = parentElement.children.indexOf(id);
            parentElement.children.splice(index, 1);
          }

          this._adjustParentTreeWeight(parentElement, -weight);
          removedElementIDs.set(id, parentID);

          this._ownersMap.delete(id);
          if (ownerID > 0) {
            const set = this._ownersMap.get(ownerID);
            if (set !== undefined) {
              set.delete(id);
            }
          }

          if (this._errorsAndWarnings.has(id)) {
            this._errorsAndWarnings.delete(id);
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

        const recursivelyDeleteElements = elementID => {
          const element = this._idToElement.get(elementID);
          this._idToElement.delete(elementID);
          if (element) {
            // Mostly for Flow's sake
            for (let index = 0; index < element.children.length; index++) {
              recursivelyDeleteElements(element.children[index]);
            }
          }
        };

        const root = ((this._idToElement.get(id): any): Element);
        recursivelyDeleteElements(id);

        this._rootIDToCapabilities.delete(id);
        this._rootIDToRendererID.delete(id);
        this._roots = this._roots.filter(rootID => rootID !== id);
        this._weightAcrossRoots -= root.weight;
        break;
      }
      case TREE_OPERATION_REORDER_CHILDREN: {
        const id = ((operations[i + 1]: any): number);
        const numChildren = ((operations[i + 2]: any): number);
        i += 3;

        if (!this._idToElement.has(id)) {
          this._throwAndEmitError(
            Error(
              `Cannot reorder children for node "${id}" because no matching node was found in the Store.`,
            ),
          );
        }

        const element = ((this._idToElement.get(id): any): Element);
        const children = element.children;
        if (children.length !== numChildren) {
          this._throwAndEmitError(
            Error(
              `Children cannot be added or removed during a reorder operation.`,
            ),
          );
        }

        for (let j = 0; j < numChildren; j++) {
          const childID = operations[i + j];
          children[j] = childID;
          if (__DEV__) {
            // This check is more expensive so it's gated by __DEV__.
            const childElement = this._idToElement.get(childID);
            if (childElement == null || childElement.parentID !== id) {
              console.error(
                `Children cannot be added or removed during a reorder operation.`,
              );
            }
          }
        }
        i += numChildren;

        if (__DEBUG__) {
          debug('Re-order', `Node ${id} children ${children.join(',')}`);
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
          this._recursivelyUpdateSubtree(id, element => {
            element.isStrictModeNonCompliant = false;
          });
        }

        if (__DEBUG__) {
          debug(
            'Subtree mode',
            `Subtree with root ${id} set to mode ${mode}`,
          );
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
          this._errorsAndWarnings.set(id, {errorCount, warningCount});
        } else if (this._errorsAndWarnings.has(id)) {
          this._errorsAndWarnings.delete(id);
        }
        haveErrorsOrWarningsChanged = true;
        break;
      default:
        this._throwAndEmitError(
          new UnsupportedBridgeOperationError(
            `Unsupported Bridge operation "${operation}"`,
          ),
        );
    }
  }

  this._revision++;

  // Any time the tree changes (e.g. elements added, removed, or reordered) cached inidices may be invalid.
  this._cachedErrorAndWarningTuples = null;

  if (haveErrorsOrWarningsChanged) {
    let errorCount = 0;
    let warningCount = 0;

    this._errorsAndWarnings.forEach(entry => {
      errorCount += entry.errorCount;
      warningCount += entry.warningCount;
    });

    this._cachedErrorCount = errorCount;
    this._cachedWarningCount = warningCount;
  }

  if (haveRootsChanged) {
    const prevRootSupportsProfiling = this._rootSupportsBasicProfiling;
    const prevRootSupportsTimelineProfiling = this
      ._rootSupportsTimelineProfiling;

    this._hasOwnerMetadata = false;
    this._rootSupportsBasicProfiling = false;
    this._rootSupportsTimelineProfiling = false;
    this._rootIDToCapabilities.forEach(
      ({supportsBasicProfiling, hasOwnerMetadata, supportsTimeline}) => {
        if (supportsBasicProfiling) {
          this._rootSupportsBasicProfiling = true;
        }
        if (hasOwnerMetadata) {
          this._hasOwnerMetadata = true;
        }
        if (supportsTimeline) {
          this._rootSupportsTimelineProfiling = true;
        }
      },
    );

    this.emit('roots');

    if (this._rootSupportsBasicProfiling !== prevRootSupportsProfiling) {
      this.emit('rootSupportsBasicProfiling');
    }

    if (
      this._rootSupportsTimelineProfiling !==
      prevRootSupportsTimelineProfiling
    ) {
      this.emit('rootSupportsTimelineProfiling');
    }
  }

  if (__DEBUG__) {
    console.log(printStore(this, true));
    console.groupEnd();
  }

  this.emit('mutated', [addedElementIDs, removedElementIDs]);
};